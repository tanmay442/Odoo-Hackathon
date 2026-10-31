import { expect, test } from '@playwright/test'
import { eq } from 'drizzle-orm'

import { getDatabase } from '../../src/db/client'
import { users } from '../../src/db/schema/users'
import { createCustomer } from '../../src/features/customers/mutations'
import { decidePayment } from '../../src/features/payments/decide'
import { submitPaymentClaim } from '../../src/features/payments/initiate'
import { getPortalInvoice, getPortalOverview } from '../../src/features/portal/queries'
import { createProduct } from '../../src/features/products/mutations'
import { createSubscription } from '../../src/features/subscriptions/mutations'
import { transitionSubscription } from '../../src/features/subscriptions/transitions'
import { ensureUserRecord } from '../../src/features/users/mutations'
import { confirmInvoice } from '../../src/features/invoices/mutations'
import { runBillingJobWithDatabase } from '../../src/jobs/run-billing'

for (const path of [
  '/portal',
  '/portal/subscriptions',
  '/portal/invoices',
  '/portal/account',
]) {
  test(`signed-out visitor is sent to sign-in from ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/sign-in/)
  })
}

test('customer journey: sign up, see subscription, pay, staff verifies, portal shows paid', async () => {
  const database = getDatabase()
  const admin = await ensureUserRecord(database, {
    clerkUserId: 'user_e2e_portal_admin',
    email: 'e2e-portal-admin@example.com',
    displayName: 'e2e-portal-admin@example.com',
  })
  await database.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
  const staff = await ensureUserRecord(database, {
    clerkUserId: `user_e2e_portal_staff_${Date.now()}`,
    email: `e2e-portal-staff-${Date.now()}@example.com`,
    displayName: 'staff',
  })
  await database.update(users).set({ role: 'staff' }).where(eq(users.id, staff.id))
  const product = await createProduct(database, { ...admin, role: 'admin' }, {
    name: `E2E Portal Suite ${Date.now()}`,
    type: 'software',
    salesPriceMinor: 100000,
    costPriceMinor: 40000,
    currency: 'INR',
    notes: null,
  })
  const { plans } = await import('../../src/db/schema/plans')
  const [plan] = await database
    .insert(plans)
    .values({
      name: `E2E Portal Monthly ${Date.now()}`,
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
  const customer = await createCustomer(database, { ...staff, role: 'staff' }, {
    displayName: 'E2E Portal Buyer',
    email: `e2e-portal-${Date.now()}@example.com`,
    phone: null,
    billingAddress: null,
    taxIdentifier: null,
    notes: null,
  })
  const login = await ensureUserRecord(database, {
    clerkUserId: `user_e2e_portal_customer_${Date.now()}`,
    email: `e2e-portal-login-${Date.now()}@example.com`,
    displayName: 'buyer',
  })
  await database.update(users).set({ customerId: customer.id }).where(eq(users.id, login.id))
  const buyer = await ensureUserRecord(database, {
    clerkUserId: login.clerkUserId,
    email: login.email,
    displayName: 'buyer',
  })
  const created = await createSubscription(database, { ...staff, role: 'staff' }, {
    customerId: customer.id,
    planId: plan.id,
    startDate: '2026-03-01',
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
  })
  await transitionSubscription(database, { ...staff, role: 'staff' }, created.id, 'quotation')
  await transitionSubscription(database, { ...staff, role: 'staff' }, created.id, 'confirmed')
  await transitionSubscription(database, { ...staff, role: 'staff' }, created.id, 'active')
  const now = new Date('2026-04-15T00:00:00Z')
  await runBillingJobWithDatabase(database, now)
  const stored = await database.query.invoices.findMany()
  const invoice = stored.find((row) => row.subscriptionId === created.id)
  if (!invoice) throw new Error('Billing seed lost its invoice')
  await confirmInvoice(database, { ...staff, role: 'staff' }, invoice.id)

  const before = await getPortalOverview(database, customer.id)
  expect(before.activeSubscriptions).toHaveLength(1)
  expect(before.balanceDueMinor).toBe(100000)

  const claim = await submitPaymentClaim(database, buyer, {
    invoiceId: invoice.id,
    method: 'upi',
    amountMinor: 100000,
    currency: 'INR',
    paidOn: '2026-04-10',
    note: 'E2E-UPI-1',
  })
  expect(claim.status).toBe('pending_verification')
  const submitted = await getPortalInvoice(database, customer.id, invoice.id)
  expect(submitted.payments[0].displayStatus).toBe('Submitted')

  await decidePayment(database, { ...staff, role: 'staff' }, claim.id, { approved: true, reason: '' })
  const after = await getPortalOverview(database, customer.id)
  expect(after.balanceDueMinor).toBe(0)
  const paid = await getPortalInvoice(database, customer.id, invoice.id)
  expect(paid.detail.status).toBe('paid')
  expect(paid.payments[0].displayStatus).toBe('Verified')
})
