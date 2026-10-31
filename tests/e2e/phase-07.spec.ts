import { expect, test } from '@playwright/test'
import { eq } from 'drizzle-orm'

import { getDatabase } from '../../src/db/client'
import { plans } from '../../src/db/schema/plans'
import { users } from '../../src/db/schema/users'
import { getDashboardSummary } from '../../src/features/dashboard/queries'
import { createCustomer } from '../../src/features/customers/mutations'
import { confirmInvoice } from '../../src/features/invoices/mutations'
import { recordStaffPayment } from '../../src/features/payments/initiate'
import { createProduct } from '../../src/features/products/mutations'
import { createSubscription } from '../../src/features/subscriptions/mutations'
import { transitionSubscription } from '../../src/features/subscriptions/transitions'
import { ensureUserRecord } from '../../src/features/users/mutations'
import { runBillingJobWithDatabase } from '../../src/jobs/run-billing'

test('signed-out visitor is sent to sign-in from /app/dashboard', async ({ page }) => {
  await page.goto('/app/dashboard')
  await expect(page).toHaveURL(/\/sign-in/)
})

test('dashboard filters change all cards and charts together', async () => {
  const database = getDatabase()
  const admin = await ensureUserRecord(database, {
    clerkUserId: 'user_e2e_dash_admin',
    email: 'e2e-dash-admin@example.com',
    displayName: 'e2e-dash-admin@example.com',
  })
  await database.update(users).set({ role: 'admin' }).where(eq(users.id, admin.id))
  const staff = await ensureUserRecord(database, {
    clerkUserId: `user_e2e_dash_staff_${Date.now()}`,
    email: `e2e-dash-staff-${Date.now()}@example.com`,
    displayName: 'staff',
  })
  await database.update(users).set({ role: 'staff' }).where(eq(users.id, staff.id))
  const product = await createProduct(database, { ...admin, role: 'admin' }, {
    name: `E2E Suite ${Date.now()}`,
    type: 'software',
    salesPriceMinor: 100000,
    costPriceMinor: 40000,
    currency: 'INR',
    notes: null,
  })
  const now = new Date('2026-04-15T00:00:00Z')
  const planIds: string[] = []
  for (const [name, start] of [['E2E A', '2026-01-01'], ['E2E B', '2026-03-01']] as const) {
    const [plan] = await database
      .insert(plans)
      .values({
        name: `${name} ${Date.now()}`,
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
    planIds.push(plan.id)
    const customer = await createCustomer(database, { ...staff, role: 'staff' }, {
      displayName: 'E2E Acme',
      email: `e2e-dash-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`,
      phone: null,
      billingAddress: null,
      taxIdentifier: null,
      notes: null,
    })
    const created = await createSubscription(database, { ...staff, role: 'staff' }, {
      customerId: customer.id,
      planId: plan.id,
      startDate: start,
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
  }
  const before = new Set((await database.query.invoices.findMany()).map((invoice) => invoice.id))
  await runBillingJobWithDatabase(database, now)
  const stored = (await database.query.invoices.findMany()).filter((invoice) => !before.has(invoice.id))
  for (const invoice of stored) await confirmInvoice(database, { ...staff, role: 'staff' }, invoice.id)
  const [first] = [...stored].sort(
    (one, other) => one.periodStart.getTime() - other.periodStart.getTime(),
  )
  await recordStaffPayment(database, { ...staff, role: 'staff' }, {
    invoiceId: first.id,
    method: 'bank_transfer',
    amountMinor: 100000,
    currency: 'INR',
    paidOn: '2026-02-10',
    note: 'E2E-1',
  })

  const unfiltered = await getDashboardSummary(database, {}, now)
  const planFiltered = await getDashboardSummary(database, { planId: planIds[1] }, now)
  expect(planFiltered.activeSubscriptions).toBe(1)
  expect(planFiltered.activeSubscriptions).toBeLessThan(unfiltered.activeSubscriptions)
  expect(planFiltered.outstandingMinor).toBeLessThan(unfiltered.outstandingMinor)
  expect(planFiltered.revenueByMonth.length).toBeLessThanOrEqual(unfiltered.revenueByMonth.length)
  const chartRevenue = planFiltered.revenueByMonth.reduce((total, row) => total + row.revenueMinor, 0)
  expect(chartRevenue).toBe(planFiltered.revenueMinor)
  const bucketAmount = planFiltered.agingBuckets.reduce((total, row) => total + row.amountMinor, 0)
  expect(bucketAmount).toBe(planFiltered.outstandingMinor)
})
