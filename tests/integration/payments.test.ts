import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

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
import { ForbiddenError } from '../../src/lib/auth'
import { createCustomer } from '../../src/features/customers/mutations'
import { confirmInvoice } from '../../src/features/invoices/mutations'
import { decidePayment } from '../../src/features/payments/decide'
import {
  initiateStoredPayment,
  recordStaffPayment,
  submitPaymentClaim,
} from '../../src/features/payments/initiate'
import {
  invoiceBalance,
  listVerificationQueue,
} from '../../src/features/payments/queries'
import { createProduct } from '../../src/features/products/mutations'
import { createSubscription } from '../../src/features/subscriptions/mutations'
import { transitionSubscription } from '../../src/features/subscriptions/transitions'
import { ensureUserRecord } from '../../src/features/users/mutations'
import { runBillingJobWithDatabase } from '../../src/jobs/run-billing'
import { createManualPaymentAdapter } from '../../src/ports/adapters/payments/manual-payment-adapter'
import { createMockGatewayAdapter } from '../../src/ports/adapters/payments/mock-gateway-adapter'

const database = getDatabase()
const TOTAL = 100000

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
let customerUser: UserRow

beforeAll(async () => {
  await truncate()
})

beforeEach(async () => {
  await truncate()
  admin = await actorWithRole(
    'user_pay_admin',
    'pay-admin@example.com',
    'admin',
  )
  staff = await actorWithRole(
    'user_pay_staff',
    'pay-staff@example.com',
    'staff',
  )
  customerUser = await actorWithRole(
    'user_pay_customer',
    'pay-customer@example.com',
    'customer',
  )
})

async function seedConfirmedInvoice() {
  const product = await createProduct(database, admin, {
    name: 'Suite',
    type: 'software',
    salesPriceMinor: TOTAL,
    costPriceMinor: 40000,
    currency: 'INR',
    notes: null,
  })
  const insertedPlans = await database
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
    })
    .returning()
  const plan = insertedPlans[0]
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
    planId: plan.id,
    startDate: '2026-09-01',
    paymentTerms: null,
    sourceTemplateId: null,
    lines: [
      {
        productId: product.id,
        variantId: null,
        description: '',
        quantity: 1,
        unitPriceMinor: TOTAL,
        taxIds: [],
      },
    ],
  })
  await transitionSubscription(database, staff, created.id, 'quotation')
  await transitionSubscription(database, staff, created.id, 'confirmed')
  await transitionSubscription(database, staff, created.id, 'active')
  await runBillingJobWithDatabase(database, new Date('2026-10-15T00:00:00Z'))
  const rows = await database.query.invoices.findMany()
  if (rows.length !== 1) throw new Error('Billing seed lost its invoice')
  const confirmed = await confirmInvoice(database, staff, rows[0].id)
  await database
    .update(users)
    .set({ customerId: customer.id })
    .where(eq(users.id, customerUser.id))
  const linked = await ensureUserRecord(database, {
    clerkUserId: 'user_pay_customer',
    email: 'pay-customer@example.com',
    displayName: 'pay-customer@example.com',
  })
  return { invoice: confirmed, customer, customerActor: linked }
}

async function eventsFor(paymentId: string) {
  return database.query.paymentEvents.findMany({
    where: eq(paymentEvents.paymentId, paymentId),
  })
}

describe('staff recording', () => {
  it('records full payment and flips the invoice to paid with outbox rows', async () => {
    const { invoice } = await seedConfirmedInvoice()
    const paid = await recordStaffPayment(database, staff, {
      invoiceId: invoice.id,
      method: 'bank_transfer',
      amountMinor: TOTAL,
      currency: 'INR',
      paidOn: '2026-10-20',
      note: 'NEFT-1',
    })
    expect(paid.status).toBe('verified')
    const reloaded = await database.query.invoices.findFirst({
      where: eq(invoices.id, invoice.id),
    })
    expect(reloaded?.status).toBe('paid')
    expect(reloaded?.amountPaidMinor).toBe(TOTAL)
    expect(reloaded?.paidAt).not.toBeNull()
    const events = await eventsFor(paid.id)
    expect(events.map((event) => event.eventType)).toEqual([
      'initiated',
      'verified',
    ])
    const outbox = await database.query.outboxEvents.findMany()
    const types = outbox.map((event) => event.type)
    expect(types).toContain('payment.verified')
    expect(types).toContain('invoice.paid')
  })

  it('rejects a zero amount and refuses cancelled invoices', async () => {
    const { invoice } = await seedConfirmedInvoice()
    await expect(
      recordStaffPayment(database, staff, {
        invoiceId: invoice.id,
        method: 'cash',
        amountMinor: 0,
        currency: 'INR',
        paidOn: '2026-10-20',
        note: '',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' })
    const { cancelInvoice } =
      await import('../../src/features/invoices/mutations')
    await cancelInvoice(database, staff, invoice.id, 'Duplicate.')
    await expect(
      recordStaffPayment(database, staff, {
        invoiceId: invoice.id,
        method: 'cash',
        amountMinor: 100,
        currency: 'INR',
        paidOn: '2026-10-20',
        note: '',
      }),
    ).rejects.toMatchObject({ code: 'INVOICE_NOT_PAYABLE' })
  })

  it('forbids non-staff recording', async () => {
    const { invoice } = await seedConfirmedInvoice()
    await expect(
      recordStaffPayment(database, customerUser, {
        invoiceId: invoice.id,
        method: 'cash',
        amountMinor: 100,
        currency: 'INR',
        paidOn: '2026-10-20',
        note: '',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('customer claims', () => {
  it('leaves invoice totals and status untouched until verified', async () => {
    const { invoice, customerActor } = await seedConfirmedInvoice()
    const claim = await submitPaymentClaim(database, customerActor, {
      invoiceId: invoice.id,
      method: 'upi',
      amountMinor: TOTAL,
      currency: 'INR',
      paidOn: '2026-10-21',
      note: 'UPI-9',
    })
    expect(claim.status).toBe('pending_verification')
    const reloaded = await database.query.invoices.findFirst({
      where: eq(invoices.id, invoice.id),
    })
    expect(reloaded?.amountPaidMinor).toBe(0)
    expect(reloaded?.status).toBe('confirmed')
    const queue = await listVerificationQueue(database)
    expect(queue.total).toBe(1)
    expect(queue.rows[0].invoiceNumber).toBe(invoice.number)
  })

  it('keeps partial payments confirmed with the right balance, then flips atomically', async () => {
    const { invoice, customerActor } = await seedConfirmedInvoice()
    const first = await submitPaymentClaim(database, customerActor, {
      invoiceId: invoice.id,
      method: 'upi',
      amountMinor: 40000,
      currency: 'INR',
      paidOn: '2026-10-21',
      note: '',
    })
    await decidePayment(database, staff, first.id, {
      approved: true,
      reason: '',
    })
    const partial = await database.query.invoices.findFirst({
      where: eq(invoices.id, invoice.id),
    })
    expect(partial?.status).toBe('confirmed')
    expect(partial?.amountPaidMinor).toBe(40000)
    expect(invoiceBalance(partial!).balanceMinor).toBe(60000)
    const second = await submitPaymentClaim(database, customerActor, {
      invoiceId: invoice.id,
      method: 'upi',
      amountMinor: 60000,
      currency: 'INR',
      paidOn: '2026-10-22',
      note: '',
    })
    await decidePayment(database, staff, second.id, {
      approved: true,
      reason: '',
    })
    const settled = await database.query.invoices.findFirst({
      where: eq(invoices.id, invoice.id),
    })
    expect(settled?.status).toBe('paid')
    expect(settled?.amountPaidMinor).toBe(TOTAL)
    expect(settled?.paidAt).not.toBeNull()
  })

  it('shows overpayment as excess on a paid invoice', async () => {
    const { invoice } = await seedConfirmedInvoice()
    await recordStaffPayment(database, staff, {
      invoiceId: invoice.id,
      method: 'bank_transfer',
      amountMinor: TOTAL + 20000,
      currency: 'INR',
      paidOn: '2026-10-20',
      note: '',
    })
    const reloaded = await database.query.invoices.findFirst({
      where: eq(invoices.id, invoice.id),
    })
    expect(reloaded?.status).toBe('paid')
    expect(invoiceBalance(reloaded!).overpaidMinor).toBe(20000)
    expect(invoiceBalance(reloaded!).balanceMinor).toBe(0)
  })
})

describe('rejection', () => {
  it('requires a reason, appends an event, and never touches invoice totals', async () => {
    const { invoice, customerActor } = await seedConfirmedInvoice()
    const claim = await submitPaymentClaim(database, customerActor, {
      invoiceId: invoice.id,
      method: 'cheque',
      amountMinor: TOTAL,
      currency: 'INR',
      paidOn: '2026-10-21',
      note: '',
    })
    await expect(
      decidePayment(database, staff, claim.id, {
        approved: false,
        reason: '  ',
      }),
    ).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
    })
    const rejected = await decidePayment(database, staff, claim.id, {
      approved: false,
      reason: 'Cheque bounced.',
    })
    expect(rejected.status).toBe('rejected')
    const events = await eventsFor(claim.id)
    expect(events.map((event) => event.eventType)).toEqual([
      'initiated',
      'rejected',
    ])
    expect(events[1].payload.reason).toBe('Cheque bounced.')
    const reloaded = await database.query.invoices.findFirst({
      where: eq(invoices.id, invoice.id),
    })
    expect(reloaded?.amountPaidMinor).toBe(0)
    expect(reloaded?.status).toBe('confirmed')
  })

  it('never rewrites non-status fields on decide', async () => {
    const { invoice, customerActor } = await seedConfirmedInvoice()
    const claim = await submitPaymentClaim(database, customerActor, {
      invoiceId: invoice.id,
      method: 'upi',
      amountMinor: 50000,
      currency: 'INR',
      paidOn: '2026-10-21',
      note: 'keep-me',
    })
    const before = await database.query.payments.findFirst({
      where: eq(payments.id, claim.id),
    })
    await decidePayment(database, staff, claim.id, {
      approved: true,
      reason: '',
    })
    const after = await database.query.payments.findFirst({
      where: eq(payments.id, claim.id),
    })
    expect(after?.amountMinor).toBe(before?.amountMinor)
    expect(after?.method).toBe(before?.method)
    expect(after?.invoiceId).toBe(before?.invoiceId)
    expect(after?.note).toBe(before?.note)
    expect(after?.idempotencyKey).toBe(before?.idempotencyKey)
    expect(after?.status).toBe('verified')
  })
})

describe('concurrency', () => {
  it('settles concurrent verifications exactly once with one invoice.paid outbox row', async () => {
    const { invoice, customerActor } = await seedConfirmedInvoice()
    const first = await submitPaymentClaim(database, customerActor, {
      invoiceId: invoice.id,
      method: 'upi',
      amountMinor: 50000,
      currency: 'INR',
      paidOn: '2026-10-21',
      note: '',
    })
    const second = await submitPaymentClaim(database, customerActor, {
      invoiceId: invoice.id,
      method: 'upi',
      amountMinor: 50000,
      currency: 'INR',
      paidOn: '2026-10-21',
      note: '',
    })
    await Promise.all([
      decidePayment(database, staff, first.id, { approved: true, reason: '' }),
      decidePayment(database, staff, second.id, { approved: true, reason: '' }),
    ])
    const reloaded = await database.query.invoices.findFirst({
      where: eq(invoices.id, invoice.id),
    })
    expect(reloaded?.status).toBe('paid')
    expect(reloaded?.amountPaidMinor).toBe(TOTAL)
    const outbox = await database.query.outboxEvents.findMany()
    expect(
      outbox.filter((event) => event.type === 'invoice.paid'),
    ).toHaveLength(1)
    expect(
      outbox.filter((event) => event.type === 'payment.verified'),
    ).toHaveLength(2)
  })
})

describe('cancelled invoices', () => {
  it('refuses to verify a claim on a cancelled invoice', async () => {
    const { invoice, customerActor } = await seedConfirmedInvoice()
    const claim = await submitPaymentClaim(database, customerActor, {
      invoiceId: invoice.id,
      method: 'upi',
      amountMinor: TOTAL,
      currency: 'INR',
      paidOn: '2026-10-21',
      note: '',
    })
    const { cancelInvoice } =
      await import('../../src/features/invoices/mutations')
    await cancelInvoice(database, staff, invoice.id, 'Order withdrawn.')
    await expect(
      decidePayment(database, staff, claim.id, { approved: true, reason: '' }),
    ).rejects.toMatchObject({
      code: 'INVOICE_NOT_PAYABLE',
    })
    const reloaded = await database.query.payments.findFirst({
      where: eq(payments.id, claim.id),
    })
    expect(reloaded?.status).toBe('pending_verification')
    expect(await eventsFor(claim.id)).toHaveLength(1)
  })
})

describe('idempotency', () => {
  it('returns the original payment on replayed initiate with no duplicate or extra event', async () => {
    const { invoice } = await seedConfirmedInvoice()
    const key = crypto.randomUUID()
    const first = await initiateStoredPayment(database, {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      method: 'bank_transfer',
      adapter: 'manual',
      amountMinor: 1000,
      currency: 'INR',
      paidOn: '2026-10-20',
      note: '',
      recordedBy: staff.id,
      idempotencyKey: key,
      initialStatus: 'recorded',
    })
    const second = await initiateStoredPayment(database, {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      method: 'bank_transfer',
      adapter: 'manual',
      amountMinor: 1000,
      currency: 'INR',
      paidOn: '2026-10-20',
      note: '',
      recordedBy: staff.id,
      idempotencyKey: key,
      initialStatus: 'recorded',
    })
    expect(second.id).toBe(first.id)
    const rows = await database.query.payments.findMany({
      where: eq(payments.idempotencyKey, key),
    })
    expect(rows).toHaveLength(1)
    expect(await eventsFor(first.id)).toHaveLength(1)
  })
})

describe('manual adapter contract', () => {
  it('passes the port contract', async () => {
    const { invoice } = await seedConfirmedInvoice()
    const adapter = createManualPaymentAdapter(database, staff.id, {
      method: 'cash',
      paidOn: '2026-10-20',
      note: 'counter',
    })
    const key = crypto.randomUUID()
    const first = await adapter.initiate({
      invoiceId: invoice.id,
      amountMinor: 25000,
      currency: 'INR',
      idempotencyKey: key,
    })
    expect(first.status).toBe('recorded')
    const replayed = await adapter.initiate({
      invoiceId: invoice.id,
      amountMinor: 25000,
      currency: 'INR',
      idempotencyKey: key,
    })
    expect(replayed.paymentId).toBe(first.paymentId)
    await expect(
      adapter.verify({
        paymentId: first.paymentId,
        evidence: { kind: 'gateway-fetch', gatewayStatus: 'succeeded' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EVIDENCE' })
    await expect(
      adapter.verify({
        paymentId: first.paymentId,
        evidence: {
          kind: 'staff-decision',
          actorUserId: staff.id,
          approved: false,
        },
      }),
    ).rejects.toMatchObject({ code: 'REASON_REQUIRED' })
    const rejected = await adapter.verify({
      paymentId: first.paymentId,
      evidence: {
        kind: 'staff-decision',
        actorUserId: staff.id,
        approved: false,
        note: 'Short.',
      },
    })
    expect(rejected.outcome).toBe('rejected')
    const approved = await adapter.initiate({
      invoiceId: invoice.id,
      amountMinor: 25000,
      currency: 'INR',
      idempotencyKey: crypto.randomUUID(),
    })
    const verified = await adapter.verify({
      paymentId: approved.paymentId,
      evidence: {
        kind: 'staff-decision',
        actorUserId: staff.id,
        approved: true,
      },
    })
    expect(verified.outcome).toBe('verified')
  })
})

describe('mock gateway adapter contract', () => {
  it('passes the port contract', async () => {
    const { invoice } = await seedConfirmedInvoice()
    const adapter = createMockGatewayAdapter(database, staff.id)
    const key = crypto.randomUUID()
    const first = await adapter.initiate({
      invoiceId: invoice.id,
      amountMinor: 30000,
      currency: 'INR',
      idempotencyKey: key,
    })
    expect(first.status).toBe('pending_verification')
    const replayed = await adapter.initiate({
      invoiceId: invoice.id,
      amountMinor: 30000,
      currency: 'INR',
      idempotencyKey: key,
    })
    expect(replayed.paymentId).toBe(first.paymentId)
    const settled = await adapter.verify({
      paymentId: first.paymentId,
      evidence: {
        kind: 'gateway-fetch',
        gatewayStatus: 'succeeded',
        gatewayReference: 'gw-1',
      },
    })
    expect(settled.outcome).toBe('verified')
    const failing = await adapter.initiate({
      invoiceId: invoice.id,
      amountMinor: 1000,
      currency: 'INR',
      idempotencyKey: crypto.randomUUID(),
    })
    const failed = await adapter.verify({
      paymentId: failing.paymentId,
      evidence: {
        kind: 'gateway-webhook',
        rawPayload: { status: 'failed' },
        gatewayReference: 'gw-2',
      },
    })
    expect(failed.outcome).toBe('failed')
    const failedRow = await database.query.payments.findFirst({
      where: eq(payments.id, failing.paymentId),
    })
    expect(failedRow?.status).toBe('failed')
    const malformed = await adapter.initiate({
      invoiceId: invoice.id,
      amountMinor: 1000,
      currency: 'INR',
      idempotencyKey: crypto.randomUUID(),
    })
    await expect(
      adapter.verify({
        paymentId: malformed.paymentId,
        evidence: { kind: 'gateway-webhook', rawPayload: {} },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EVIDENCE' })
    const staffApproved = await adapter.initiate({
      invoiceId: invoice.id,
      amountMinor: 1000,
      currency: 'INR',
      idempotencyKey: crypto.randomUUID(),
    })
    const decided = await adapter.verify({
      paymentId: staffApproved.paymentId,
      evidence: {
        kind: 'staff-decision',
        actorUserId: staff.id,
        approved: true,
      },
    })
    expect(decided.outcome).toBe('verified')
  })
})
