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
import { emailJobs } from '../../src/db/schema/email-jobs'
import {
  invoiceDiscounts,
  invoiceLineTaxes,
  invoiceLines,
  invoiceTaxes,
  invoices,
} from '../../src/db/schema/invoices'
import { jobRuns } from '../../src/db/schema/job-runs'
import { outboxEvents } from '../../src/db/schema/outbox'
import { paymentEvents, payments } from '../../src/db/schema/payments'
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
import { queueChaseEmail } from '../../src/features/dashboard/mutations'
import { listOverdueInvoices } from '../../src/features/dashboard/overdue'
import { getDashboardSummary } from '../../src/features/dashboard/queries'
import { confirmInvoice } from '../../src/features/invoices/mutations'
import { recordStaffPayment } from '../../src/features/payments/initiate'
import { createProduct } from '../../src/features/products/mutations'
import { createSubscription } from '../../src/features/subscriptions/mutations'
import { transitionSubscription } from '../../src/features/subscriptions/transitions'
import { ensureUserRecord } from '../../src/features/users/mutations'
import { runBillingJobWithDatabase } from '../../src/jobs/run-billing'

const database = getDatabase()
const NOW = new Date('2026-04-15T00:00:00Z')
const FULL = 100000
const PARTIAL = 30000

async function truncate() {
  await database.delete(paymentEvents)
  await database.delete(payments)
  await database.delete(invoiceDiscounts)
  await database.delete(invoiceLineTaxes)
  await database.delete(invoiceTaxes)
  await database.delete(invoiceLines)
  await database.delete(invoices)
  await database.delete(emailJobs)
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
  for (const name of ['subscription', 'invoice']) {
    await database
      .insert(counters)
      .values({ name, value: 0 })
      .onConflictDoNothing({ target: counters.name })
    await database.update(counters).set({ value: 0 }).where(eq(counters.name, name))
  }
}

async function actorWithRole(clerkUserId: string, email: string, role: UserRow['role']) {
  const user = await ensureUserRecord(database, { clerkUserId, email, displayName: email })
  await database.update(users).set({ role }).where(eq(users.id, user.id))
  return ensureUserRecord(database, { clerkUserId, email, displayName: email })
}

let admin: UserRow
let staff: UserRow

beforeAll(async () => {
  await truncate()
})

beforeEach(async () => {
  await truncate()
  admin = await actorWithRole('user_dash_admin', 'dash-admin@example.com', 'admin')
  staff = await actorWithRole('user_dash_staff', 'dash-staff@example.com', 'staff')
})

afterAll(async () => {
  await truncate()
})

async function seedPlan(name: string) {
  const inserted = await database
    .insert(plans)
    .values({
      name,
      productId: null,
      priceMinor: FULL,
      currency: 'INR',
      billingInterval: 'monthly',
      intervalCount: 1,
      minQuantity: 1,
      autoCloseAtEnd: false,
      allowEarlyClose: true,
      allowPause: true,
      allowRenew: true,
    })
    .returning()
  if (inserted.length === 0) throw new Error('Plan seed lost its row')
  return inserted[0]
}

async function seedActiveSubscription(planId: string, startDate: string, activate = true) {
  const product = await createProduct(database, admin, {
    name: `Suite ${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    type: 'software',
    salesPriceMinor: FULL,
    costPriceMinor: 40000,
    currency: 'INR',
    notes: null,
  })
  const customer = await createCustomer(database, staff, {
    displayName: 'Acme',
    email: `acme-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
    phone: null,
    billingAddress: null,
    taxIdentifier: null,
    notes: null,
  })
  const created = await createSubscription(database, staff, {
    customerId: customer.id,
    planId,
    startDate,
    paymentTerms: null,
    sourceTemplateId: null,
    lines: [
      {
        productId: product.id,
        variantId: null,
        description: '',
        quantity: 1,
        unitPriceMinor: FULL,
        taxIds: [],
      },
    ],
  })
  await transitionSubscription(database, staff, created.id, 'quotation')
  if (!activate) {
    const reloaded = await database.query.subscriptions.findFirst({
      where: eq(subscriptions.id, created.id),
    })
    if (!reloaded) throw new Error('Subscription seed lost its row')
    return reloaded
  }
  await transitionSubscription(database, staff, created.id, 'confirmed')
  return transitionSubscription(database, staff, created.id, 'active')
}

async function seedFixture() {
  const planA = await seedPlan('Monthly A')
  const planB = await seedPlan('Monthly B')
  await seedActiveSubscription(planA.id, '2026-01-01')
  await seedActiveSubscription(planB.id, '2026-03-01')
  await seedActiveSubscription(planA.id, '2026-02-01', false)
  await runBillingJobWithDatabase(database, NOW)
  const stored = await database.query.invoices.findMany()
  expect(stored).toHaveLength(4)
  for (const invoice of stored) await confirmInvoice(database, staff, invoice.id)
  const byPeriod = [...stored].sort(
    (first, second) => first.periodStart.getTime() - second.periodStart.getTime(),
  )
  await recordStaffPayment(database, staff, {
    invoiceId: byPeriod[0].id,
    method: 'bank_transfer',
    amountMinor: FULL,
    currency: 'INR',
    paidOn: '2026-02-10',
    note: 'NEFT-1',
  })
  await recordStaffPayment(database, staff, {
    invoiceId: byPeriod[2].id,
    method: 'bank_transfer',
    amountMinor: PARTIAL,
    currency: 'INR',
    paidOn: '2026-03-10',
    note: 'PART-1',
  })
  return { planA, planB, invoices: byPeriod }
}

describe('dashboard cards', () => {
  it('matches SQL hand-counts for all four cards', async () => {
    await seedFixture()
    const summary = await getDashboardSummary(database, {}, NOW)
    expect(summary.activeSubscriptions).toBe(2)
    expect(summary.byStatus).toContainEqual({ status: 'active', count: 2 })
    expect(summary.byStatus).toContainEqual({ status: 'quotation', count: 1 })
    expect(summary.revenueMinor).toBe(FULL + PARTIAL)
    expect(summary.outstandingMinor).toBe(FULL + (FULL - PARTIAL) + FULL)
    expect(summary.outstandingCount).toBe(3)
    expect(summary.overdueCount).toBe(3)
    expect(summary.overdueMinor).toBe(FULL + (FULL - PARTIAL) + FULL)
  })

  it('charts reconcile with the cards', async () => {
    await seedFixture()
    const summary = await getDashboardSummary(database, {}, NOW)
    const chartRevenue = summary.revenueByMonth.reduce((total, row) => total + row.revenueMinor, 0)
    expect(chartRevenue).toBe(summary.revenueMinor)
    const bucketAmount = summary.agingBuckets.reduce((total, row) => total + row.amountMinor, 0)
    const bucketCount = summary.agingBuckets.reduce((total, row) => total + row.count, 0)
    expect(bucketAmount).toBe(summary.outstandingMinor)
    expect(bucketCount).toBe(summary.outstandingCount)
    const buckets = new Map(summary.agingBuckets.map((row) => [row.bucket, row]))
    expect(buckets.get('60+')?.amountMinor).toBe(0)
    expect(buckets.get('31-60')?.amountMinor).toBe(FULL)
    expect(buckets.get('1-30')?.amountMinor).toBe(FULL - PARTIAL + FULL)
    expect(buckets.get('current')?.amountMinor).toBe(0)
  })

  it('plan and status filters scope every card', async () => {
    const { planA, planB } = await seedFixture()
    const planBOnly = await getDashboardSummary(database, { planId: planB.id }, NOW)
    expect(planBOnly.activeSubscriptions).toBe(1)
    expect(planBOnly.revenueMinor).toBe(0)
    expect(planBOnly.outstandingMinor).toBe(FULL)
    expect(planBOnly.outstandingCount).toBe(1)
    expect(planBOnly.overdueCount).toBe(1)
    const planAOnly = await getDashboardSummary(database, { planId: planA.id }, NOW)
    expect(planAOnly.activeSubscriptions).toBe(1)
    expect(planAOnly.revenueMinor).toBe(FULL + PARTIAL)
    const quotedOnly = await getDashboardSummary(database, { status: 'quotation' }, NOW)
    expect(quotedOnly.activeSubscriptions).toBe(0)
    expect(quotedOnly.byStatus).toEqual([{ status: 'quotation', count: 1 }])
    expect(quotedOnly.revenueMinor).toBe(0)
    expect(quotedOnly.outstandingMinor).toBe(0)
  })

  it('date range scopes revenue and balances', async () => {
    await seedFixture()
    const dueScoped = await getDashboardSummary(database, { from: '2026-03-01', to: '2026-03-31' }, NOW)
    expect(dueScoped.outstandingMinor).toBe(FULL)
    expect(dueScoped.outstandingCount).toBe(1)
  })
})

describe('dashboard payload shape', () => {
  it('returns aggregates only, never raw subscription or invoice rows', async () => {
    await seedFixture()
    const summary = await getDashboardSummary(database, {}, NOW)
    expect(Object.keys(summary).sort()).toEqual(
      [
        'activeSubscriptions',
        'agingBuckets',
        'byStatus',
        'currency',
        'outstandingCount',
        'outstandingMinor',
        'overdueCount',
        'overdueMinor',
        'revenueByMonth',
        'revenueMinor',
        'subscriptionFlow',
      ].sort(),
    )
    for (const row of summary.revenueByMonth) expect(Object.keys(row).sort()).toEqual(['month', 'revenueMinor'])
    for (const row of summary.subscriptionFlow) expect(Object.keys(row).sort()).toEqual(['closed', 'month', 'opened'])
    for (const row of summary.agingBuckets) expect(Object.keys(row).sort()).toEqual(['amountMinor', 'bucket', 'count'])
    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('unitPriceMinor')
    expect(serialized).not.toContain('subscription_lines')
    expect(serialized.length).toBeLessThan(20000)
    const overdue = await listOverdueInvoices(database, {}, NOW)
    for (const row of overdue.rows) {
      expect(Object.keys(row).sort()).toEqual(
        [
          'balanceMinor',
          'customerId',
          'customerName',
          'daysOverdue',
          'dueDate',
          'invoiceId',
          'invoiceNumber',
          'paidMinor',
          'planName',
          'subscriptionId',
          'totalMinor',
        ].sort(),
      )
    }
    expect(overdue.total).toBe(3)
    const daysByInvoice = new Map(overdue.rows.map((row) => [row.invoiceNumber, row.daysOverdue]))
    const sortedNumbers = [...daysByInvoice.keys()].sort()
    expect(daysByInvoice.get(sortedNumbers[0])).toBe(45)
    expect(daysByInvoice.get(sortedNumbers[1])).toBe(14)
    expect(daysByInvoice.get(sortedNumbers[2])).toBe(14)
  })

  it('caps overdue pages at 100 rows', async () => {
    await seedFixture()
    const page = await listOverdueInvoices(database, { pageSize: 500 }, NOW)
    expect(page.pageSize).toBe(100)
    expect(page.rows.length).toBeLessThanOrEqual(100)
  })
})

describe('overdue chase', () => {
  it('queues an email job for an overdue invoice and refuses a paid one', async () => {
    const { invoices: seeded } = await seedFixture()
    const overdueId = seeded[1].id
    const queued = await queueChaseEmail(database, staff, overdueId, NOW)
    expect(queued.invoiceId).toBe(overdueId)
    const jobs = await database.query.emailJobs.findMany()
    expect(jobs).toHaveLength(1)
    expect(jobs[0].template).toBe('invoice_overdue')
    expect(jobs[0].status).toBe('queued')
    await expect(queueChaseEmail(database, staff, seeded[0].id, NOW)).rejects.toMatchObject({
      code: 'CHASE_REFUSED',
    })
  })

  it('refuses chase from a customer role', async () => {
    const { invoices: seeded } = await seedFixture()
    const customer = await actorWithRole('user_dash_cust', 'dash-cust@example.com', 'customer')
    await expect(queueChaseEmail(database, customer, seeded[1].id, NOW)).rejects.toMatchObject({
      name: 'ForbiddenError',
    })
  })
})
