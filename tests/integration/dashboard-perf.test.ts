import { eq, sql } from 'drizzle-orm'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import { getDatabase } from '../../src/db/client'
import { counters } from '../../src/db/schema/counters'
import { customers } from '../../src/db/schema/customers'
import { emailJobs } from '../../src/db/schema/email-jobs'
import { invoices } from '../../src/db/schema/invoices'
import { payments } from '../../src/db/schema/payments'
import { plans } from '../../src/db/schema/plans'
import { products } from '../../src/db/schema/products'
import { subscriptions } from '../../src/db/schema/subscriptions'
import { users } from '../../src/db/schema/users'
import { listOverdueInvoices } from '../../src/features/dashboard/overdue'
import { getDashboardSummary } from '../../src/features/dashboard/queries'

const database = getDatabase()
const NOW = new Date('2026-04-15T00:00:00Z')
const SCALE = 5000
// Local budget for the dashboard server response at bulk-seed scale. CI
// runners are slower than dev machines, so the budget follows this variable.
const BUDGET_MS = Number(process.env.DASHBOARD_PERF_MS ?? 2000)

async function bulkSeed() {
  await database.delete(payments)
  await database.delete(invoices)
  await database.delete(emailJobs)
  await database.delete(subscriptions)
  await database.delete(plans)
  await database.delete(products)
  await database.delete(users)
  await database.delete(customers)
  const [customer] = await database
    .insert(customers)
    .values({ displayName: 'Bulk', email: `bulk-${Date.now()}@example.com` })
    .returning()
  const [product] = await database
    .insert(products)
    .values({
      name: 'Bulk Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
    })
    .returning()
  const [plan] = await database
    .insert(plans)
    .values({
      name: 'Bulk Monthly',
      productId: product.id,
      priceMinor: 100000,
      currency: 'INR',
      billingInterval: 'monthly',
      intervalCount: 1,
      minQuantity: 1,
    })
    .returning()
  void product
  const subscriptionRows = Array.from({ length: SCALE }, (_, index) => {
    const month = String((index % 12) + 1).padStart(2, '0')
    return {
      number: `SUB-B${String(index).padStart(6, '0')}`,
      customerId: customer.id,
      planId: plan.id,
      status: index % 10 === 0 ? ('paused' as const) : ('active' as const),
      startDate: new Date(`2025-${month}-01T00:00:00Z`),
      expiryDate: new Date('2027-01-01T00:00:00Z'),
      currentPeriodStart: new Date('2026-03-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-04-01T00:00:00Z'),
      nextBillingAt: new Date('2026-04-01T00:00:00Z'),
      createdAt: new Date(`2025-${month}-15T00:00:00Z`),
      updatedAt: new Date(`2026-03-15T00:00:00Z`),
    }
  })
  const insertedSubscriptions = await database
    .insert(subscriptions)
    .values(subscriptionRows)
    .returning({ id: subscriptions.id })
  const invoiceRows = insertedSubscriptions.map((row, index) => ({
    number: `INV-B${String(index).padStart(6, '0')}`,
    subscriptionId: row.id,
    customerId: customer.id,
    status: 'confirmed' as const,
    periodStart: new Date('2026-03-01T00:00:00Z'),
    periodEnd: new Date('2026-04-01T00:00:00Z'),
    subtotalMinor: 100000,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: 100000,
    amountPaidMinor: index % 2 === 0 ? 100000 : 0,
    dueDate: new Date(index % 2 === 0 ? '2026-05-01T00:00:00Z' : '2026-03-01T00:00:00Z'),
    idempotencyKey: `perf:${index}`,
  }))
  const insertedInvoices = await database
    .insert(invoices)
    .values(invoiceRows)
    .returning({ id: invoices.id, amountPaidMinor: invoices.amountPaidMinor })
  const paymentRows = insertedInvoices
    .filter((row) => row.amountPaidMinor === 100000)
    .map((row, index) => ({
      invoiceId: row.id,
      customerId: customer.id,
      method: 'bank_transfer',
      adapter: 'manual',
      amountMinor: 100000,
      currency: 'INR',
      status: 'verified' as const,
      recordedBy: 'perf',
      verifiedAt: new Date('2026-04-10T00:00:00Z'),
      paidOn: '2026-04-09',
      note: '',
      idempotencyKey: `perf-pay:${index}`,
    }))
  await database.insert(payments).values(paymentRows)
  await database.execute(sql`ANALYZE invoices, payments, subscriptions`)
}

beforeAll(async () => {
  await bulkSeed()
}, 120000)

afterAll(async () => {
  await database.delete(payments)
  await database.delete(invoices)
  await database.delete(emailJobs)
  await database.delete(subscriptions)
  await database.delete(plans)
  await database.delete(products)
  await database.delete(users)
  await database.delete(customers)
  await database.update(counters).set({ value: 0 }).where(eq(counters.name, 'subscription'))
  await database.update(counters).set({ value: 0 }).where(eq(counters.name, 'invoice'))
})

describe('dashboard at bulk-seed scale', () => {
  it('serves the full summary in under budget', async () => {
    const started = Date.now()
    const summary = await getDashboardSummary(database, {}, NOW)
    const elapsed = Date.now() - started
    expect(summary.activeSubscriptions).toBeGreaterThan(0)
    expect(summary.overdueCount).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(BUDGET_MS)
  })

  it('serves the overdue page in under budget', async () => {
    const started = Date.now()
    const page = await listOverdueInvoices(database, { pageSize: 100 }, NOW)
    const elapsed = Date.now() - started
    expect(page.rows.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(BUDGET_MS)
  })
})
