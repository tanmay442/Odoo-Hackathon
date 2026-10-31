import { expect, test } from '@playwright/test'

import { getDatabase } from '../../src/db/client'
import { createCustomer } from '../../src/features/customers/mutations'
import { createProduct } from '../../src/features/products/mutations'
import { createSubscription } from '../../src/features/subscriptions/mutations'
import { transitionSubscription } from '../../src/features/subscriptions/transitions'
import { createTax } from '../../src/features/taxes/mutations'
import { ensureUserRecord } from '../../src/features/users/mutations'
import { runBillingJobWithDatabase } from '../../src/jobs/run-billing'

for (const path of ['/app/invoices', '/admin/billing']) {
  test(`signed-out visitor is sent to sign-in from ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/sign-in/)
  })
}

test('billing job endpoint without secret returns 401', async ({ request }) => {
  const response = await request.post('/api/jobs/run-billing')
  expect(response.status()).toBe(401)
})

test('billing day: activate subscription due today, run billing, invoice is confirmed-ready with correct totals', async () => {
  const database = getDatabase()
  const admin = await ensureUserRecord(database, {
    clerkUserId: 'user_e2e_bill_admin',
    email: 'e2e-bill-admin@example.com',
    displayName: 'e2e-bill-admin@example.com',
  })
  const { eq } = await import('drizzle-orm')
  const { users } = await import('../../src/db/schema/users')
  await database.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
  const staff = await ensureUserRecord(database, {
    clerkUserId: 'user_e2e_bill_staff',
    email: `e2e-bill-staff-${Date.now()}@example.com`,
    displayName: 'staff',
  })
  await database.update(users).set({ role: 'staff' }).where(eq(users.id, staff.id))

  const tax = await createTax(database, { ...admin, role: 'admin' }, {
    name: 'GST 18%',
    rateBasisPoints: 1800,
    isActive: true,
  })
  const product = await createProduct(database, { ...admin, role: 'admin' }, {
    name: 'Suite',
    type: 'software',
    salesPriceMinor: 100000,
    costPriceMinor: 40000,
    currency: 'INR',
    notes: null,
  })
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
  const customer = await createCustomer(database, { ...staff, role: 'staff' }, {
    displayName: 'Acme',
    email: `acme-e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
    phone: null,
    billingAddress: null,
    taxIdentifier: null,
    notes: null,
  })
  const created = await createSubscription(database, { ...staff, role: 'staff' }, {
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
        taxIds: [tax.id],
      },
    ],
  })
  await transitionSubscription(database, { ...staff, role: 'staff' }, created.id, 'quotation')
  await transitionSubscription(database, { ...staff, role: 'staff' }, created.id, 'confirmed')
  await transitionSubscription(database, { ...staff, role: 'staff' }, created.id, 'active')

  const summary = await runBillingJobWithDatabase(database, new Date('2026-10-15T00:00:00Z'))
  expect(summary.invoiced).toBeGreaterThanOrEqual(1)

  const { invoices } = await import('../../src/db/schema/invoices')
  const { desc } = await import('drizzle-orm')
  const rows = await database.query.invoices.findMany({
    where: eq(invoices.subscriptionId, created.id),
    orderBy: [desc(invoices.createdAt)],
    limit: 1,
  })
  expect(rows.length).toBe(1)
  expect(rows[0].status).toBe('draft')
  expect(rows[0].subtotalMinor).toBe(100000)
  expect(rows[0].taxMinor).toBe(18000)
  expect(rows[0].totalMinor).toBe(118000)

  const { confirmInvoice } = await import('../../src/features/invoices/mutations')
  const confirmed = await confirmInvoice(database, { ...staff, role: 'staff' }, rows[0].id)
  expect(confirmed.status).toBe('confirmed')
  expect(confirmed.totalMinor).toBe(118000)
})
