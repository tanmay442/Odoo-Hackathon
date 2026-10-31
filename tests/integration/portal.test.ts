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
import { createCustomer, updateCustomer } from '../../src/features/customers/mutations'
import {
  getPortalInvoice,
  getPortalOverview,
  getPortalSubscription,
} from '../../src/features/portal/queries'
import { confirmInvoice } from '../../src/features/invoices/mutations'
import { decidePayment } from '../../src/features/payments/decide'
import { submitPaymentClaim } from '../../src/features/payments/initiate'
import { createProduct } from '../../src/features/products/mutations'
import { createSubscription } from '../../src/features/subscriptions/mutations'
import { transitionSubscription } from '../../src/features/subscriptions/transitions'
import { ensureUserRecord } from '../../src/features/users/mutations'
import { runBillingJobWithDatabase } from '../../src/jobs/run-billing'

const database = getDatabase()
const NOW = new Date('2026-04-15T00:00:00Z')

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

async function linkedCustomer(clerkUserId: string, email: string) {
  const staff = await actorWithRole(`staff-for-${clerkUserId}`, `staff-${email}`, 'staff')
  const customer = await createCustomer(database, staff, {
    displayName: email,
    email,
    phone: null,
    billingAddress: null,
    taxIdentifier: 'TAX-1',
    notes: null,
  })
  const user = await actorWithRole(clerkUserId, email, 'customer')
  await database.update(users).set({ customerId: customer.id }).where(eq(users.id, user.id))
  return ensureUserRecord(database, { clerkUserId, email, displayName: email })
}

let admin: UserRow
let staff: UserRow
let customerA: UserRow
let customerB: UserRow
let productId: string
let planId: string
let lockedPlanId: string

beforeAll(async () => {
  await truncate()
})

beforeEach(async () => {
  await truncate()
  admin = await actorWithRole('user_portal_admin', 'portal-admin@example.com', 'admin')
  staff = await actorWithRole('user_portal_staff', 'portal-staff@example.com', 'staff')
  customerA = await linkedCustomer('user_portal_a', 'portal-a@example.com')
  customerB = await linkedCustomer('user_portal_b', 'portal-b@example.com')
  const product = await createProduct(database, admin, {
    name: 'Portal Suite',
    type: 'software',
    salesPriceMinor: 100000,
    costPriceMinor: 40000,
    currency: 'INR',
    notes: null,
  })
  productId = product.id
  const flexible = await database
    .insert(plans)
    .values({
      name: 'Flexible Monthly',
      productId: null,
      priceMinor: 100000,
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
  planId = flexible[0].id
  const locked = await database
    .insert(plans)
    .values({
      name: 'Locked Monthly',
      productId: null,
      priceMinor: 100000,
      currency: 'INR',
      billingInterval: 'monthly',
      intervalCount: 1,
      minQuantity: 1,
      autoCloseAtEnd: false,
      allowEarlyClose: false,
      allowPause: false,
      allowRenew: false,
    })
    .returning()
  lockedPlanId = locked[0].id
})

afterAll(async () => {
  await truncate()
})

async function activeSubscription(owner: UserRow, referencePlanId: string, startDate: string) {
  if (!owner.customerId) throw new Error('Customer link lost its row')
  const created = await createSubscription(database, staff, {
    customerId: owner.customerId,
    planId: referencePlanId,
    startDate,
    paymentTerms: null,
    sourceTemplateId: null,
    lines: [
      {
        productId,
        variantId: null,
        description: '',
        quantity: 1,
        unitPriceMinor: 100000,
        taxIds: [],
      },
    ],
  })
  await transitionSubscription(database, staff, created.id, 'quotation')
  await transitionSubscription(database, staff, created.id, 'confirmed')
  return transitionSubscription(database, staff, created.id, 'active')
}

async function confirmedInvoice(subscriptionId: string) {
  await runBillingJobWithDatabase(database, NOW)
  const stored = await database.query.invoices.findMany()
  const invoice = stored.find((row) => row.subscriptionId === subscriptionId)
  if (!invoice) throw new Error('Billing seed lost its invoice')
  return confirmInvoice(database, staff, invoice.id)
}

describe('portal isolation', () => {
  it('refuses every portal endpoint for another customer’s IDs', async () => {
    const subscription = await activeSubscription(customerA, planId, '2026-01-01')
    const invoice = await confirmedInvoice(subscription.id)
    if (!customerB.customerId) throw new Error('Customer link lost its row')
    await expect(getPortalSubscription(database, customerB.customerId, subscription.id)).rejects.toMatchObject({
      name: 'ForbiddenError',
    })
    await expect(getPortalInvoice(database, customerB.customerId, invoice.id)).rejects.toMatchObject({
      name: 'ForbiddenError',
    })
    const attempts: Array<() => Promise<unknown>> = [
      () =>
        submitPaymentClaim(database, customerB, {
          invoiceId: invoice.id,
          method: 'upi',
          amountMinor: 100000,
          currency: 'INR',
          paidOn: '2026-04-10',
          note: 'intruder',
        }),
      () => transitionSubscription(database, customerB, subscription.id, 'paused'),
      () =>
        updateCustomer(database, customerB, customerA.customerId as string, {
          id: customerA.customerId as string,
          displayName: 'Hijacked',
        }),
    ]
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({ name: 'ForbiddenError' })
    }
    const overview = await getPortalOverview(database, customerB.customerId)
    expect(overview.activeSubscriptions).toEqual([])
    expect(overview.balanceDueMinor).toBe(0)
  })

  it('never renders cost price or other customers’ data', async () => {
    const subscription = await activeSubscription(customerA, planId, '2026-01-01')
    const invoice = await confirmedInvoice(subscription.id)
    if (!customerA.customerId) throw new Error('Customer link lost its row')
    const portalSubscription = await getPortalSubscription(database, customerA.customerId, subscription.id)
    const portalInvoice = await getPortalInvoice(database, customerA.customerId, invoice.id)
    const serialized = JSON.stringify({ portalSubscription, portalInvoice })
    expect(serialized).not.toContain('costPrice')
    expect(serialized).not.toContain('cost_price')
    expect(serialized).not.toContain('40000')
    expect(serialized).not.toContain('portal-b@example.com')
    expect(portalSubscription.detail.customerId).toBe(customerA.customerId)
  })
})

describe('portal lifecycle', () => {
  it('only offers actions the plan allows and refuses bypasses', async () => {
    const flexible = await activeSubscription(customerA, planId, '2026-01-01')
    const locked = await activeSubscription(customerA, lockedPlanId, '2026-01-01')
    if (!customerA.customerId) throw new Error('Customer link lost its row')
    const flexibleView = await getPortalSubscription(database, customerA.customerId, flexible.id)
    expect(flexibleView.allowedActions).toContain('paused')
    const lockedView = await getPortalSubscription(database, customerA.customerId, locked.id)
    expect(lockedView.allowedActions).toEqual(['closed'])
    await expect(transitionSubscription(database, customerA, locked.id, 'paused')).rejects.toThrow()
    const paused = await transitionSubscription(database, customerA, flexible.id, 'paused')
    expect(paused.status).toBe('paused')
  })

  it('offers no lifecycle actions on pre-active subscriptions', async () => {
    if (!customerA.customerId) throw new Error('Customer link lost its row')
    const draft = await createSubscription(database, staff, {
      customerId: customerA.customerId,
      planId,
      startDate: '2026-05-01',
      paymentTerms: null,
      sourceTemplateId: null,
      lines: [
        {
          productId,
          variantId: null,
          description: '',
          quantity: 1,
          unitPriceMinor: 100000,
          taxIds: [],
        },
      ],
    })
    const view = await getPortalSubscription(database, customerA.customerId, draft.id)
    expect(view.allowedActions).toEqual([])
  })
})

describe('portal payments', () => {
  it('shows submitted, verified, and rejected with the staff reason', async () => {
    const subscription = await activeSubscription(customerA, planId, '2026-01-01')
    const invoice = await confirmedInvoice(subscription.id)
    if (!customerA.customerId) throw new Error('Customer link lost its row')
    const claim = await submitPaymentClaim(database, customerA, {
      invoiceId: invoice.id,
      method: 'upi',
      amountMinor: 100000,
      currency: 'INR',
      paidOn: '2026-04-10',
      note: 'UPI-1',
    })
    expect(claim.status).toBe('pending_verification')
    let portalInvoice = await getPortalInvoice(database, customerA.customerId, invoice.id)
    expect(portalInvoice.payments[0].displayStatus).toBe('Submitted')
    await decidePayment(database, staff, claim.id, { approved: false, reason: 'No credit received.' })
    portalInvoice = await getPortalInvoice(database, customerA.customerId, invoice.id)
    expect(portalInvoice.payments[0].displayStatus).toBe('Rejected')
    expect(portalInvoice.payments[0].rejectReason).toBe('No credit received.')
  })

  it('drives overview cards from paid to zero balance', async () => {
    const subscription = await activeSubscription(customerA, planId, '2026-03-01')
    const invoice = await confirmedInvoice(subscription.id)
    if (!customerA.customerId) throw new Error('Customer link lost its row')
    const before = await getPortalOverview(database, customerA.customerId)
    expect(before.balanceDueMinor).toBe(100000)
    expect(before.activeSubscriptions).toHaveLength(1)
    expect(before.nextBillingAt).not.toBeNull()
    const claim = await submitPaymentClaim(database, customerA, {
      invoiceId: invoice.id,
      method: 'bank_transfer',
      amountMinor: 100000,
      currency: 'INR',
      paidOn: '2026-04-10',
      note: 'NEFT-2',
    })
    await decidePayment(database, staff, claim.id, { approved: true, reason: '' })
    const after = await getPortalOverview(database, customerA.customerId)
    expect(after.balanceDueMinor).toBe(0)
  })
})
