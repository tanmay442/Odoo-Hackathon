import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'

import { getDatabase } from '../../src/db/client'
import { counters } from '../../src/db/schema/counters'
import { customers } from '../../src/db/schema/customers'
import {
  discountProducts,
  discounts,
  subscriptionDiscounts,
} from '../../src/db/schema/discounts'
import {
  invoiceDiscounts,
  invoiceLineTaxes,
  invoiceLines,
  invoiceTaxes,
  invoices,
} from '../../src/db/schema/invoices'
import { paymentEvents, payments } from '../../src/db/schema/payments'
import { jobRuns } from '../../src/db/schema/job-runs'
import { outboxEvents } from '../../src/db/schema/outbox'
import { plans } from '../../src/db/schema/plans'
import { productVariants, products } from '../../src/db/schema/products'
import { staffInvites } from '../../src/db/schema/staff-invites'
import {
  subscriptionEvents,
  subscriptionLines,
  subscriptionLineTaxes,
  subscriptions,
} from '../../src/db/schema/subscriptions'
import {
  quotationTemplateLines,
  quotationTemplateLineTaxes,
  quotationTemplates,
} from '../../src/db/schema/templates'
import { taxes } from '../../src/db/schema/taxes'
import { users } from '../../src/db/schema/users'
import type { UserRow } from '../../src/db/schema/users'
import { createCustomer } from '../../src/features/customers/mutations'
import {
  attachDiscount,
  createDiscount,
} from '../../src/features/discounts/mutations'
import { buildNextInvoicePreview } from '../../src/features/discounts/preview'
import { createProduct } from '../../src/features/products/mutations'
import { createSubscription } from '../../src/features/subscriptions/mutations'
import { transitionSubscription } from '../../src/features/subscriptions/transitions'
import { createTax } from '../../src/features/taxes/mutations'
import { runBillingJobWithDatabase } from '../../src/jobs/run-billing'
import { getInvoiceDetail } from '../../src/features/invoices/queries'
import { ensureUserRecord } from '../../src/features/users/mutations'
import { handleRunBilling } from '../../src/routes/api/jobs/run-billing'

const database = getDatabase()

async function truncate() {
  await database.delete(paymentEvents)
  await database.delete(payments)
  await database.delete(invoiceDiscounts)
  await database.delete(invoiceLineTaxes)
  await database.delete(invoiceTaxes)
  await database.delete(invoiceLines)
  await database.delete(invoices)
  await database.delete(outboxEvents)
  await database.delete(jobRuns)
  await database.delete(subscriptionDiscounts)
  await database.delete(subscriptionEvents)
  await database.delete(subscriptionLineTaxes)
  await database.delete(subscriptionLines)
  await database.delete(subscriptions)
  await database.delete(discountProducts)
  await database.delete(discounts)
  await database.delete(quotationTemplateLineTaxes)
  await database.delete(quotationTemplateLines)
  await database.delete(quotationTemplates)
  await database.delete(productVariants)
  await database.delete(plans)
  await database.delete(products)
  await database.delete(taxes)
  await database.delete(users)
  await database.delete(staffInvites)
  await database.delete(customers)
  await database
    .update(counters)
    .set({ value: 0 })
    .where(eq(counters.name, 'subscription'))
  await database
    .insert(counters)
    .values({ name: 'invoice', value: 0 })
    .onConflictDoNothing({ target: counters.name })
  await database
    .update(counters)
    .set({ value: 0 })
    .where(eq(counters.name, 'invoice'))
}

async function actorWithRole(
  clerkUserId: string,
  email: string,
  role: UserRow['role'],
) {
  const user = await ensureUserRecord(database, {
    clerkUserId,
    email,
    displayName: email,
  })
  await database.update(users).set({ role }).where(eq(users.id, user.id))
  const reloaded = await ensureUserRecord(database, {
    clerkUserId,
    email,
    displayName: email,
  })
  if (reloaded.role !== role) throw new Error('Role setup failed')
  return reloaded
}

let admin: UserRow
let staff: UserRow

beforeAll(async () => {
  await truncate()
})

beforeEach(async () => {
  await truncate()
  admin = await actorWithRole(
    'user_bill_admin',
    'bill-admin@example.com',
    'admin',
  )
  staff = await actorWithRole(
    'user_bill_staff',
    'bill-staff@example.com',
    'staff',
  )
})

afterAll(async () => {
  await truncate()
})

async function seedPlan(overrides: Record<string, unknown> = {}) {
  const inserted = await database
    .insert(plans)
    .values({
      name: 'Monthly',
      productId: null,
      priceMinor: 500000,
      currency: 'INR',
      billingInterval: 'monthly',
      intervalCount: 1,
      minQuantity: 1,
      autoCloseAtEnd: false,
      allowEarlyClose: true,
      allowPause: true,
      allowRenew: true,
      ...overrides,
    })
    .returning()
  if (inserted.length === 0) throw new Error('Plan seed lost its row')
  return inserted[0]
}

async function seedCustomer() {
  return createCustomer(database, staff, {
    displayName: 'Acme',
    email: `acme-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
    phone: null,
    billingAddress: null,
    taxIdentifier: null,
    notes: null,
  })
}

async function seedActiveSubscription(options: {
  planId: string
  customerId: string
  productId: string
  startDate: string
  unitPriceMinor?: number
  taxIds?: string[]
}) {
  const created = await createSubscription(database, staff, {
    customerId: options.customerId,
    planId: options.planId,
    startDate: options.startDate,
    paymentTerms: null,
    sourceTemplateId: null,
    lines: [
      {
        productId: options.productId,
        variantId: null,
        description: '',
        quantity: 1,
        unitPriceMinor: options.unitPriceMinor ?? 100000,
        taxIds: options.taxIds ?? [],
      },
    ],
  })
  await transitionSubscription(database, staff, created.id, 'quotation')
  await transitionSubscription(database, staff, created.id, 'confirmed')
  const activated = await transitionSubscription(
    database,
    staff,
    created.id,
    'active',
  )
  return activated
}

describe('billing job idempotency', () => {
  it('creates exactly one invoice per due period on double and concurrent runs', async () => {
    const product = await createProduct(database, admin, {
      name: 'Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
      notes: null,
    })
    const plan = await seedPlan()
    const buyer = await seedCustomer()
    await seedActiveSubscription({
      planId: plan.id,
      customerId: buyer.id,
      productId: product.id,
      startDate: '2026-01-01',
    })
    const now = new Date('2026-02-15T00:00:00Z')
    const first = await runBillingJobWithDatabase(database, now)
    expect(first.invoiced).toBe(1)
    const second = await runBillingJobWithDatabase(database, now)
    expect(second.invoiced).toBe(0)
    const [parallelFirst, parallelSecond] = await Promise.all([
      runBillingJobWithDatabase(database, now),
      runBillingJobWithDatabase(database, now),
    ])
    expect(parallelFirst.invoiced + parallelSecond.invoiced).toBe(0)
    const stored = await database.query.invoices.findMany()
    expect(stored).toHaveLength(1)
    expect(stored[0].idempotencyKey).toBe(
      `invoice:${stored[0].subscriptionId}:${new Date('2026-01-01T00:00:00Z').toISOString()}`,
    )
  })

  it('catches up three missed periods with one invoice per period', async () => {
    const product = await createProduct(database, admin, {
      name: 'Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
      notes: null,
    })
    const plan = await seedPlan()
    const buyer = await seedCustomer()
    await seedActiveSubscription({
      planId: plan.id,
      customerId: buyer.id,
      productId: product.id,
      startDate: '2025-12-01',
    })
    const now = new Date('2026-03-15T00:00:00Z')
    const summary = await runBillingJobWithDatabase(database, now)
    expect(summary.invoiced).toBe(3)
    const stored = await database.query.invoices.findMany()
    expect(stored).toHaveLength(3)
    const keys = stored.map((row) => row.idempotencyKey).sort()
    expect(new Set(keys).size).toBe(3)
  })
})

describe('billing lifecycle', () => {
  it('auto-close plan closes at expiry with a final invoice', async () => {
    const product = await createProduct(database, admin, {
      name: 'Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
      notes: null,
    })
    const plan = await seedPlan({ autoCloseAtEnd: true })
    const buyer = await seedCustomer()
    const subscription = await seedActiveSubscription({
      planId: plan.id,
      customerId: buyer.id,
      productId: product.id,
      startDate: '2026-01-01',
    })
    expect(subscription.expiryDate.toISOString().slice(0, 10)).toBe(
      '2026-02-01',
    )
    const summary = await runBillingJobWithDatabase(
      database,
      new Date('2026-02-15T00:00:00Z'),
    )
    expect(summary.invoiced).toBe(1)
    expect(summary.closed).toBe(1)
    const reloaded = await database.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscription.id),
    })
    expect(reloaded?.status).toBe('closed')
    const events = await database.query.outboxEvents.findMany()
    expect(events.map((row) => row.type).sort()).toEqual([
      'invoice.generated',
      'subscription.closed',
    ])
  })

  it('non-auto-close plan renews past expiry', async () => {
    const product = await createProduct(database, admin, {
      name: 'Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
      notes: null,
    })
    const plan = await seedPlan({ autoCloseAtEnd: false })
    const buyer = await seedCustomer()
    const subscription = await seedActiveSubscription({
      planId: plan.id,
      customerId: buyer.id,
      productId: product.id,
      startDate: '2026-01-01',
    })
    const summary = await runBillingJobWithDatabase(
      database,
      new Date('2026-02-15T00:00:00Z'),
    )
    expect(summary.invoiced).toBe(1)
    expect(summary.closed).toBe(0)
    const reloaded = await database.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscription.id),
    })
    expect(reloaded?.status).toBe('active')
    expect(reloaded?.nextBillingAt?.toISOString().slice(0, 10)).toBe(
      '2026-03-01',
    )
  })
})

describe('billing discounts and frozen totals', () => {
  it('increments discount usage exactly once per invoice under concurrency', async () => {
    const product = await createProduct(database, admin, {
      name: 'Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
      notes: null,
    })
    const plan = await seedPlan()
    const buyer = await seedCustomer()
    const subscription = await seedActiveSubscription({
      planId: plan.id,
      customerId: buyer.id,
      productId: product.id,
      startDate: '2026-01-01',
    })
    const rule = await createDiscount(database, admin, {
      name: 'Once',
      kind: 'percentage',
      valueMinorOrBasisPoints: 1000,
      scope: 'subscription',
      productIds: [],
      minPurchaseMinor: null,
      minQuantity: null,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 1,
      isActive: true,
    })
    await attachDiscount(database, staff, {
      subscriptionId: subscription.id,
      discountId: rule.id,
    })
    const now = new Date('2026-02-15T00:00:00Z')
    const [first, second] = await Promise.all([
      runBillingJobWithDatabase(database, now),
      runBillingJobWithDatabase(database, now),
    ])
    expect(first.invoiced + second.invoiced).toBe(1)
    const stored = await database.query.discounts.findFirst({
      where: eq(discounts.id, rule.id),
    })
    expect(stored?.timesRedeemed).toBe(1)
    const invoiceRows = await database.query.invoices.findMany()
    expect(invoiceRows).toHaveLength(1)
    const links = await database.query.invoiceDiscounts.findMany()
    expect(links).toHaveLength(1)
    expect(links[0].amountMinor).toBe(10000)
  })

  it('matches the next-invoice preview and freezes totals against later price edits', async () => {
    const tax = await createTax(database, admin, {
      name: 'GST 18%',
      rateBasisPoints: 1800,
      isActive: true,
    })
    const product = await createProduct(database, admin, {
      name: 'Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
      notes: null,
    })
    const plan = await seedPlan()
    const buyer = await seedCustomer()
    const subscription = await seedActiveSubscription({
      planId: plan.id,
      customerId: buyer.id,
      productId: product.id,
      startDate: '2026-01-01',
      taxIds: [tax.id],
    })
    const preview = await buildNextInvoicePreview(
      database,
      subscription.id,
      new Date('2026-02-15T00:00:00Z'),
    )
    await runBillingJobWithDatabase(database, new Date('2026-02-15T00:00:00Z'))
    const stored = await database.query.invoices.findMany()
    expect(stored).toHaveLength(1)
    expect(stored[0].totalMinor).toBe(preview.totalMinor)
    expect(stored[0].subtotalMinor).toBe(preview.subtotalMinor)
    const detail = await getInvoiceDetail(database, stored[0].id)
    expect(detail?.taxes).toHaveLength(1)
    const billedTotal = stored[0].totalMinor
    await database
      .update(products)
      .set({ salesPriceMinor: 999000 })
      .where(eq(products.id, product.id))
    await database
      .update(plans)
      .set({ priceMinor: 1 })
      .where(eq(plans.id, plan.id))
    const reloaded = await database.query.invoices.findFirst({
      where: eq(invoices.id, stored[0].id),
    })
    expect(reloaded?.totalMinor).toBe(billedTotal)
  })
})

describe('billing job endpoint', () => {
  it('returns 401 without a secret', async () => {
    const previous = process.env.JOB_SECRET
    process.env.JOB_SECRET = 'test-secret-0001'
    try {
      const missing = await handleRunBilling(
        new Request('http://localhost/api/jobs/run-billing', {
          method: 'POST',
        }),
      )
      expect(missing.status).toBe(401)
      const wrong = await handleRunBilling(
        new Request('http://localhost/api/jobs/run-billing', {
          method: 'POST',
          headers: { 'x-job-secret': 'wrong' },
        }),
      )
      expect(wrong.status).toBe(401)
    } finally {
      if (previous === undefined) delete process.env.JOB_SECRET
      else process.env.JOB_SECRET = previous
    }
  })

  it('runs with a valid secret', async () => {
    const previous = process.env.JOB_SECRET
    process.env.JOB_SECRET = 'test-secret-0002'
    try {
      const product = await createProduct(database, admin, {
        name: 'Suite',
        type: 'software',
        salesPriceMinor: 100000,
        costPriceMinor: 40000,
        currency: 'INR',
        notes: null,
      })
      const plan = await seedPlan()
      const buyer = await seedCustomer()
      await seedActiveSubscription({
        planId: plan.id,
        customerId: buyer.id,
        productId: product.id,
        startDate: '2026-01-01',
      })
      const response = await handleRunBilling(
        new Request('http://localhost/api/jobs/run-billing', {
          method: 'POST',
          headers: { 'x-job-secret': 'test-secret-0002' },
        }),
      )
      expect(response.status).toBe(200)
    } finally {
      if (previous === undefined) delete process.env.JOB_SECRET
      else process.env.JOB_SECRET = previous
    }
  })
})
