import { expect, test } from '@playwright/test'
import { eq } from 'drizzle-orm'

import { getDatabase } from '../../src/db/client'
import { invoices } from '../../src/db/schema/invoices'
import { paymentEvents } from '../../src/db/schema/payments'
import { users } from '../../src/db/schema/users'
import { createCustomer } from '../../src/features/customers/mutations'
import { confirmInvoice } from '../../src/features/invoices/mutations'
import { decidePayment } from '../../src/features/payments/decide'
import {
  recordStaffPayment,
  submitPaymentClaim,
} from '../../src/features/payments/initiate'
import { createProduct } from '../../src/features/products/mutations'
import { createSubscription } from '../../src/features/subscriptions/mutations'
import { transitionSubscription } from '../../src/features/subscriptions/transitions'
import { ensureUserRecord } from '../../src/features/users/mutations'
import { runBillingJobWithDatabase } from '../../src/jobs/run-billing'

for (const path of ['/app/payments/verification-queue', '/app/invoices']) {
  test(`signed-out visitor is sent to sign-in from ${path}`, async ({
    page,
  }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/sign-in/)
  })
}

async function seedConfirmedInvoice() {
  const database = getDatabase()
  const admin = await ensureUserRecord(database, {
    clerkUserId: 'user_e2e_pay_admin',
    email: 'e2e-pay-admin@example.com',
    displayName: 'e2e-pay-admin@example.com',
  })
  await database
    .update(users)
    .set({ role: 'admin' })
    .where(eq(users.id, admin.id))
  const staff = await ensureUserRecord(database, {
    clerkUserId: `user_e2e_pay_staff_${Date.now()}`,
    email: `e2e-pay-staff-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
    displayName: 'staff',
  })
  await database
    .update(users)
    .set({ role: 'staff' })
    .where(eq(users.id, staff.id))
  const product = await createProduct(
    database,
    { ...admin, role: 'admin' },
    {
      name: 'Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
      notes: null,
    },
  )
  const { plans } = await import('../../src/db/schema/plans')
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
  const customer = await createCustomer(
    database,
    { ...staff, role: 'staff' },
    {
      displayName: 'Acme',
      email: `acme-e2e-pay-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
      phone: null,
      billingAddress: null,
      taxIdentifier: null,
      notes: null,
    },
  )
  const customerActor = await ensureUserRecord(database, {
    clerkUserId: `user_e2e_pay_customer_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`,
    email: `e2e-pay-customer-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
    displayName: 'customer',
  })
  await database
    .update(users)
    .set({ customerId: customer.id })
    .where(eq(users.id, customerActor.id))
  const created = await createSubscription(
    database,
    { ...staff, role: 'staff' },
    {
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
          unitPriceMinor: 100000,
          taxIds: [],
        },
      ],
    },
  )
  await transitionSubscription(
    database,
    { ...staff, role: 'staff' },
    created.id,
    'quotation',
  )
  await transitionSubscription(
    database,
    { ...staff, role: 'staff' },
    created.id,
    'confirmed',
  )
  await transitionSubscription(
    database,
    { ...staff, role: 'staff' },
    created.id,
    'active',
  )
  await runBillingJobWithDatabase(database, new Date('2026-10-15T00:00:00Z'))
  const rows = await database.query.invoices.findMany({
    where: eq(invoices.subscriptionId, created.id),
  })
  expect(rows.length).toBe(1)
  const confirmed = await confirmInvoice(
    database,
    { ...staff, role: 'staff' },
    rows[0].id,
  )
  const linked = await ensureUserRecord(database, {
    clerkUserId: customerActor.clerkUserId,
    email: customerActor.email,
    displayName: customerActor.email,
  })
  return { staff, customerActor: linked, invoice: confirmed }
}

test('record payment: staff records full payment and the invoice reads paid', async () => {
  const database = getDatabase()
  const { staff, invoice } = await seedConfirmedInvoice()
  await recordStaffPayment(
    database,
    { ...staff, role: 'staff' },
    {
      invoiceId: invoice.id,
      method: 'bank_transfer',
      amountMinor: invoice.totalMinor,
      currency: 'INR',
      paidOn: '2026-10-20',
      note: 'NEFT-e2e',
    },
  )
  const reloaded = await database.query.invoices.findFirst({
    where: eq(invoices.id, invoice.id),
  })
  expect(reloaded?.status).toBe('paid')
  expect(reloaded?.amountPaidMinor).toBe(invoice.totalMinor)
})

test('customer claim: pending claim verifies to paid through the staff queue', async () => {
  const database = getDatabase()
  const { staff, customerActor, invoice } = await seedConfirmedInvoice()
  const claim = await submitPaymentClaim(database, customerActor, {
    invoiceId: invoice.id,
    method: 'upi',
    amountMinor: invoice.totalMinor,
    currency: 'INR',
    paidOn: '2026-10-21',
    note: 'UPI-e2e',
  })
  expect(claim.status).toBe('pending_verification')
  const before = await database.query.invoices.findFirst({
    where: eq(invoices.id, invoice.id),
  })
  expect(before?.status).toBe('confirmed')
  expect(before?.amountPaidMinor).toBe(0)
  const decided = await decidePayment(
    database,
    { ...staff, role: 'staff' },
    claim.id,
    {
      approved: true,
      reason: '',
    },
  )
  expect(decided.status).toBe('verified')
  const after = await database.query.invoices.findFirst({
    where: eq(invoices.id, invoice.id),
  })
  expect(after?.status).toBe('paid')
  const events = await database.query.paymentEvents.findMany({
    where: eq(paymentEvents.paymentId, claim.id),
  })
  expect(events.map((event) => event.eventType)).toEqual([
    'initiated',
    'verified',
  ])
})
