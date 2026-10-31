// Brightloop demo seed plus deterministic bulk generator for the perf proof.
// Core scenes go through the same mutations as the UI. Bulk rows replicate
// the mutation math (snapshot prices, SUB-/INV- counters, 18% line tax with
// no discounts) in batched inserts, so thousands of rows seed in seconds.
// Usage: pnpm db:seed [--bulk=N] [--no-bulk] [--force]
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'

import { getDatabase  } from '../src/db/client'
import type {Database} from '../src/db/client';
import { counters } from '../src/db/schema/counters'
import { customers } from '../src/db/schema/customers'
import { invoiceLines, invoiceLineTaxes, invoiceTaxes, invoices } from '../src/db/schema/invoices'
import { paymentEvents, payments } from '../src/db/schema/payments'
import { subscriptionLines, subscriptionLineTaxes, subscriptions } from '../src/db/schema/subscriptions'
import type { UserRow } from '../src/db/schema/users'
import { addPeriod } from '../src/domain/periods'
import { createCustomer } from '../src/features/customers/mutations'
import { attachDiscount, createDiscount } from '../src/features/discounts/mutations'
import { confirmInvoice } from '../src/features/invoices/mutations'
import { recordStaffPayment, submitPaymentClaim } from '../src/features/payments/initiate'
import { createPlan } from '../src/features/plans/mutations'
import { createProduct, createVariant } from '../src/features/products/mutations'
import { createSubscription, formatSubscriptionNumber } from '../src/features/subscriptions/mutations'
import { transitionSubscription } from '../src/features/subscriptions/transitions'
import { createTax } from '../src/features/taxes/mutations'
import { createTemplate } from '../src/features/templates/mutations'
import { runBillingJobWithDatabase } from '../src/jobs/run-billing'

const BULK_SEED = 20261031
const DAY_MS = 86_400_000

const args = new Set(process.argv.slice(2))
const force = args.has('--force')
const noBulk = args.has('--no-bulk')
const bulkArg = [...args].find((arg) => arg.startsWith('--bulk='))
const bulkCount = noBulk ? 0 : Number(bulkArg?.split('=')[1] ?? 2000)

// .env.local is gitignored and holds the Neon URL for CLI scripts.
try {
  const lines = readFileSync('.env.local', 'utf8').split('\n')
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim()
  }
} catch {
  // Falls back to DATABASE_URL from the environment.
}

// Deterministic RNG: identical bulk data on every machine.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let result = state
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]
}

async function counterValue(database: Database, name: string): Promise<number> {
  await database.insert(counters).values({ name, value: 0 }).onConflictDoNothing({ target: counters.name })
  const rows = await database.select().from(counters).where(sql`${counters.name} = ${name}`)
  return rows[0]?.value ?? 0
}

async function setCounter(database: Database, name: string, value: number): Promise<void> {
  await database.insert(counters).values({ name, value }).onConflictDoUpdate({ target: counters.name, set: { value } })
}

function advancePeriods(start: Date, interval: 'daily' | 'weekly' | 'monthly' | 'yearly', count: number, times: number): Date {
  let current = start
  for (let step = 0; step < times; step += 1) current = addPeriod(current, interval, count)
  return current
}

async function main(): Promise<void> {
  if (!Number.isInteger(bulkCount) || bulkCount < 0 || bulkCount > 5000) {
    console.error('Bulk count must be an integer between 0 and 5000.')
    process.exit(1)
  }
  const database = getDatabase()
  const existing = await database.select({ id: subscriptions.id }).from(subscriptions).limit(1)
  if (existing.length > 0 && !force) {
    console.error('Subscriptions table is not empty. Re-run with --force to truncate and reseed.')
    process.exit(1)
  }
  if (existing.length > 0) {
    // Row deletes in child-first order: TRUNCATE is blocked by the
    // users.customer_id foreign key, and CASCADE would wipe signups.
    // Users, staff invites, and API tables survive a reseed.
    for (const table of [
      'payment_events', 'payments', 'invoice_taxes', 'invoice_line_taxes',
      'invoice_discounts', 'invoice_lines', 'invoices', 'outbox_events',
      'email_jobs', 'job_runs', 'subscription_events', 'subscription_line_taxes',
      'subscription_lines', 'subscription_discounts', 'subscriptions',
      'quotation_template_line_taxes', 'quotation_template_lines', 'quotation_templates',
      'discount_products', 'discounts', 'plans', 'product_variants',
      'products', 'taxes', 'customers', 'counters',
    ]) {
      await database.execute(sql.raw(`DELETE FROM ${table}`))
    }
  }

  const now = new Date()
  const actor = {
    id: randomUUID(),
    clerkUserId: 'seed-admin',
    email: 'admin@brightloop.example',
    role: 'admin',
    customerId: null,
    isSeedAdmin: true,
    createdAt: now,
    updatedAt: now,
  } satisfies UserRow

  const gst = await createTax(database, actor, { name: 'GST 18%', rateBasisPoints: 1800, isActive: true })

  const suite = await createProduct(database, actor, {
    name: 'Brightloop Business Suite',
    type: 'software',
    salesPriceMinor: 1200000,
    costPriceMinor: 400000,
    currency: 'INR',
    notes: 'Core subscription product',
  })
  const storage = await createProduct(database, actor, {
    name: 'Extra Storage Add-on',
    type: 'addon',
    salesPriceMinor: 200000,
    costPriceMinor: 50000,
    currency: 'INR',
    notes: null,
  })
  const support = await createProduct(database, actor, {
    name: 'Priority Support Add-on',
    type: 'addon',
    salesPriceMinor: 500000,
    costPriceMinor: 100000,
    currency: 'INR',
    notes: null,
  })
  const odooVariant = await createVariant(database, actor, {
    productId: suite.id,
    name: 'Odoo brand',
    priceDeltaMinor: 56000,
  })

  const monthly = await createPlan(database, actor, {
    name: 'Business Monthly',
    productId: suite.id,
    priceMinor: 1200000,
    currency: 'INR',
    billingInterval: 'monthly',
    intervalCount: 1,
    minQuantity: 1,
    availableFrom: null,
    availableTo: null,
    autoCloseAtEnd: false,
    allowEarlyClose: true,
    allowPause: true,
    allowRenew: true,
  })
  const yearly = await createPlan(database, actor, {
    name: 'Business Yearly',
    productId: suite.id,
    priceMinor: 12000000,
    currency: 'INR',
    billingInterval: 'yearly',
    intervalCount: 1,
    minQuantity: 1,
    availableFrom: null,
    availableTo: null,
    autoCloseAtEnd: false,
    allowEarlyClose: false,
    allowPause: false,
    allowRenew: true,
  })
  const addonMonthly = await createPlan(database, actor, {
    name: 'Add-on Monthly',
    productId: storage.id,
    priceMinor: 200000,
    currency: 'INR',
    billingInterval: 'monthly',
    intervalCount: 1,
    minQuantity: 1,
    availableFrom: null,
    availableTo: null,
    autoCloseAtEnd: false,
    allowEarlyClose: true,
    allowPause: true,
    allowRenew: true,
  })

  const launchDiscount = await createDiscount(database, actor, {
    name: 'Launch 10% off',
    kind: 'percentage',
    valueMinorOrBasisPoints: 1000,
    scope: 'subscription',
    productIds: [],
    minPurchaseMinor: null,
    minQuantity: null,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    isActive: true,
  })
  await createDiscount(database, actor, {
    name: 'Storage Rs 500 off',
    kind: 'fixed',
    valueMinorOrBasisPoints: 50000,
    scope: 'product',
    productIds: [storage.id],
    minPurchaseMinor: null,
    minQuantity: null,
    startsAt: null,
    endsAt: null,
    maxRedemptions: 100,
    isActive: true,
  })

  const template = await createTemplate(database, actor, {
    name: 'Standard onboarding',
    planId: monthly.id,
    validityDays: 30,
    isActive: true,
    lines: [
      { productId: suite.id, variantId: null, quantity: 1, unitPriceMinor: 1200000, taxIds: [gst.id] },
      { productId: storage.id, variantId: null, quantity: 2, unitPriceMinor: 200000, taxIds: [gst.id] },
    ],
  })

  const customerSeeds = [
    ['Acme Retail', 'accounts@acme.example'],
    ['Globex Manufacturing', 'billing@globex.example'],
    ['Initech Services', 'billing@initech.example'],
    ['Umbrella Traders', 'accounts@umbrella.example'],
    ['Hooli Labs', 'finance@hooli.example'],
    ['Stark Workshops', 'billing@stark.example'],
    ['Demo Customer One', 'customer-one@brightloop.example'],
    ['Demo Customer Two', 'customer-two@brightloop.example'],
    ['Demo Customer (Tanmay)', 'goeltanmay442@gmail.com'],
  ] as const
  const createdCustomers: Array<Awaited<ReturnType<typeof createCustomer>>> = []
  for (const [displayName, email] of customerSeeds) {
    createdCustomers.push(await createCustomer(database, actor, { displayName, email }))
  }

  const isoDay = (date: Date): string => date.toISOString().slice(0, 10)
  const daysAgo = (days: number): string => isoDay(new Date(now.getTime() - days * DAY_MS))

  const templateSub = await createSubscription(database, actor, {
    customerId: createdCustomers[7].id,
    planId: monthly.id,
    startDate: daysAgo(5),
    paymentTerms: 'Net 15',
    sourceTemplateId: template.id,
    lines: [],
  })
  await transitionSubscription(database, actor, templateSub.id, 'quotation')
  await transitionSubscription(database, actor, templateSub.id, 'confirmed')

  async function buildSubscription(customerIndex: number, planId: string, start: string, to: 'draft' | 'quotation' | 'confirmed' | 'active' | 'paused' | 'closed', withVariant: boolean) {
    const sub = await createSubscription(database, actor, {
      customerId: createdCustomers[customerIndex].id,
      planId,
      startDate: start,
      paymentTerms: 'Net 15',
      sourceTemplateId: null,
      lines: [
        {
          productId: suite.id,
          variantId: withVariant ? odooVariant.id : null,
          description: '',
          quantity: 1,
          unitPriceMinor: withVariant ? 1256000 : 1200000,
          taxIds: [gst.id],
        },
      ],
    })
    const path: Array<'draft' | 'quotation' | 'confirmed' | 'active' | 'paused' | 'closed'> =
      to === 'draft' ? [] : to === 'quotation' ? ['quotation'] : to === 'confirmed' ? ['quotation', 'confirmed'] : ['quotation', 'confirmed', 'active']
    for (const status of path) await transitionSubscription(database, actor, sub.id, status)
    if (to === 'paused') await transitionSubscription(database, actor, sub.id, 'paused')
    if (to === 'closed') await transitionSubscription(database, actor, sub.id, 'closed')
    return sub
  }

  await buildSubscription(0, monthly.id, daysAgo(10), 'draft', false)
  await buildSubscription(1, monthly.id, daysAgo(9), 'quotation', false)
  await buildSubscription(2, yearly.id, daysAgo(8), 'confirmed', true)
  const activeDue = await buildSubscription(3, monthly.id, daysAgo(45), 'active', false)
  const activeYearly = await buildSubscription(4, yearly.id, daysAgo(200), 'active', true)
  const pausedSub = await buildSubscription(5, addonMonthly.id, daysAgo(60), 'paused', false)
  await buildSubscription(6, monthly.id, daysAgo(400), 'closed', false)
  const discounted = await buildSubscription(6, monthly.id, daysAgo(40), 'active', false)
  await attachDiscount(database, actor, { subscriptionId: discounted.id, discountId: launchDiscount.id })
  const tanmayActive = await buildSubscription(8, monthly.id, daysAgo(50), 'active', true)
  void pausedSub

  const billing = await runBillingJobWithDatabase(database, now)
  console.log(`Billing run: invoiced=${billing.invoiced} skipped=${billing.skippedAlreadyBilled} errors=${billing.errors.length}`)

  const tanmayCustomerId = createdCustomers[8].id
  const tanmayInvoices = await database.query.invoices.findMany({
    where: eq(invoices.customerId, tanmayCustomerId),
  })
  for (const invoice of tanmayInvoices) {
    await confirmInvoice(database, actor, invoice.id)
    await recordStaffPayment(database, actor, {
      invoiceId: invoice.id,
      method: 'bank_transfer',
      amountMinor: invoice.totalMinor,
      currency: 'INR',
      paidOn: isoDay(now),
      note: 'Seed payment',
    })
  }
  const otherInvoices = (
    await database.query.invoices.findMany()
  ).filter((invoice) => invoice.customerId !== tanmayCustomerId)
  const dueInvoices = otherInvoices
  const first = dueInvoices[0]
  // Array access is typed as always defined; the guard covers empty core runs.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (first) {
    await confirmInvoice(database, actor, first.id)
    await recordStaffPayment(database, actor, {
      invoiceId: first.id,
      method: 'bank_transfer',
      amountMinor: first.totalMinor,
      currency: 'INR',
      paidOn: isoDay(now),
      note: 'Seed payment',
    })
  }
  const second = dueInvoices[1]
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (second) {
    await confirmInvoice(database, actor, second.id)
    const customerActor = { ...actor, id: randomUUID(), role: 'customer', customerId: second.customerId } satisfies UserRow
    await submitPaymentClaim(database, customerActor, {
      invoiceId: second.id,
      method: 'upi',
      amountMinor: second.totalMinor,
      currency: 'INR',
      paidOn: isoDay(now),
      note: 'Seed claim',
    })
  }
  void activeDue
  void activeYearly

  let bulkSubs = 0
  let bulkInvoices = 0
  if (bulkCount > 0) {
    const rng = mulberry32(BULK_SEED)
    const firstNames = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Arjun', 'Anaya', 'Vivaan', 'Ishaan', 'Priya', 'Rohan']
    const lastNames = ['Sharma', 'Patel', 'Iyer', 'Gupta', 'Nair', 'Reddy', 'Khan', 'Mehta', 'Das', 'Kulkarni']
    const bulkCustomerRows = []
    const customerTotal = Math.max(50, Math.floor(bulkCount / 5))
    for (let index = 0; index < customerTotal; index += 1) {
      const name = `${pick(rng, firstNames)} ${pick(rng, lastNames)} ${index + 1}`
      bulkCustomerRows.push({
        id: randomUUID(),
        displayName: name,
        email: `bulk-customer-${index + 1}@example.com`,
        phone: null,
        billingAddress: null,
        taxIdentifier: null,
        notes: 'Bulk seed',
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      })
    }
    for (let index = 0; index < bulkCustomerRows.length; index += 500) {
      await database.insert(customers).values(bulkCustomerRows.slice(index, index + 500))
    }

    const subCounter = await counterValue(database, 'subscription')
    const invCounter = await counterValue(database, 'invoice')
    let subSeq = subCounter
    let invSeq = invCounter

    const subRows = []
    const lineRows: Array<Record<string, unknown>> = []
    const lineTaxRows: Array<Record<string, unknown>> = []
    const dueSubIds: string[] = []
    for (let index = 0; index < bulkCount; index += 1) {
      subSeq += 1
      const customer = pick(rng, bulkCustomerRows)
      const planChoice = rng()
      const planId = planChoice < 0.6 ? monthly.id : planChoice < 0.85 ? addonMonthly.id : yearly.id
      const interval = planId === yearly.id ? 'yearly' : 'monthly'
      const start = new Date(now.getTime() - Math.floor(rng() * 330) * DAY_MS)
      const elapsed = interval === 'yearly' ? 0 : Math.max(1, Math.floor((now.getTime() - start.getTime()) / (30 * DAY_MS)))
      const currentStart = advancePeriods(start, interval, 1, elapsed)
      const currentEnd = addPeriod(currentStart, interval, 1)
      const isDue = index % 7 === 0
      const subId = randomUUID()
      subRows.push({
        id: subId,
        number: formatSubscriptionNumber(subSeq),
        customerId: customer.id,
        planId,
        status: 'active',
        startDate: start,
        expiryDate: advancePeriods(start, interval, 1, interval === 'yearly' ? 1 : 12),
        paymentTerms: 'Net 15',
        currentPeriodStart: currentStart,
        currentPeriodEnd: currentEnd,
        nextBillingAt: isDue ? new Date(now.getTime() - DAY_MS) : currentEnd,
        pausedAt: null,
        sourceTemplateId: null,
        createdAt: now,
        updatedAt: now,
      })
      if (isDue) dueSubIds.push(subId)
      const lineCount = 1 + Math.floor(rng() * 2)
      for (let line = 0; line < lineCount; line += 1) {
        const product = pick(rng, [suite, storage, support])
        const quantity = 1 + Math.floor(rng() * 4)
        const lineId = randomUUID()
        lineRows.push({
          id: lineId,
          subscriptionId: subId,
          productId: product.id,
          variantId: null,
          description: '',
          quantity,
          unitPriceMinor: product.id === suite.id ? 1200000 : product.id === storage.id ? 200000 : 500000,
          createdAt: now,
        })
        lineTaxRows.push({ subscriptionLineId: lineId, taxId: gst.id })
      }
    }
    for (let index = 0; index < subRows.length; index += 500) {
      await database.insert(subscriptions).values(subRows.slice(index, index + 500) as never)
    }
    for (let index = 0; index < lineRows.length; index += 500) {
      await database.insert(subscriptionLines).values(lineRows.slice(index, index + 500) as never)
    }
    for (let index = 0; index < lineTaxRows.length; index += 500) {
      await database.insert(subscriptionLineTaxes).values(lineTaxRows.slice(index, index + 500) as never)
    }
    await setCounter(database, 'subscription', subSeq)

    // Invoices for the last completed period of non-due bulk subs. Tax math
    // mirrors the pricing engine for the no-discount case: 18% per line.
    const billable = subRows.filter((row) => !dueSubIds.includes(row.id as string))
    const invoiceRows: Array<Record<string, unknown>> = []
    const invLineRows: Array<Record<string, unknown>> = []
    const invLineTaxRows: Array<Record<string, unknown>> = []
    const invTaxRows: Array<Record<string, unknown>> = []
    const paymentRows: Array<Record<string, unknown>> = []
    const paymentEventRows: Array<Record<string, unknown>> = []
    const linesBySub = new Map<string, Array<Record<string, unknown>>>()
    for (const line of lineRows) {
      const list = linesBySub.get(line.subscriptionId as string) ?? []
      list.push(line)
      linesBySub.set(line.subscriptionId as string, list)
    }
    for (const [index, row] of billable.entries()) {
      invSeq += 1
      const periodStart = row.currentPeriodStart
      const periodEnd = row.currentPeriodEnd
      const subLines = linesBySub.get(row.id) ?? []
      let subtotal = 0
      let tax = 0
      for (const line of subLines) {
        const base = (line.quantity as number) * (line.unitPriceMinor as number)
        subtotal += base
        tax += Math.round((base * 1800) / 10000)
      }
      const total = subtotal + tax
      const invoiceId = randomUUID()
      const paid = index % 2 === 0
      const confirmed = paid || index % 3 === 0
      invoiceRows.push({
        id: invoiceId,
        number: `INV-${String(invSeq).padStart(6, '0')}`,
        subscriptionId: row.id,
        customerId: row.customerId,
        status: paid ? 'paid' : confirmed ? 'confirmed' : 'draft',
        periodStart,
        periodEnd,
        subtotalMinor: subtotal,
        discountMinor: 0,
        taxMinor: tax,
        totalMinor: total,
        amountPaidMinor: paid ? total : 0,
        dueDate: periodEnd,
        idempotencyKey: `invoice:${row.id}:${periodStart.toISOString()}`,
        issuedAt: confirmed ? periodEnd : null,
        paidAt: paid ? periodEnd : null,
        cancelReason: null,
        createdAt: now,
        updatedAt: now,
      })
      for (const line of subLines) {
        const base = (line.quantity as number) * (line.unitPriceMinor as number)
        const lineTax = Math.round((base * 1800) / 10000)
        const invLineId = randomUUID()
        invLineRows.push({
          id: invLineId,
          invoiceId,
          productId: line.productId,
          variantId: null,
          description: '',
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          amountMinor: base,
          createdAt: now,
        })
        invLineTaxRows.push({
          invoiceLineId: invLineId,
          taxId: gst.id,
          rateBasisPoints: 1800,
          taxableAmountMinor: base,
          taxAmountMinor: lineTax,
        })
      }
      invTaxRows.push({
        invoiceId,
        taxId: gst.id,
        rateBasisPoints: 1800,
        taxableAmountMinor: subtotal,
        taxAmountMinor: tax,
      })
      if (paid) {
        const paymentId = randomUUID()
        paymentRows.push({
          id: paymentId,
          invoiceId,
          customerId: row.customerId,
          method: 'bank_transfer',
          adapter: 'manual',
          externalReference: null,
          amountMinor: total,
          currency: 'INR',
          status: 'verified',
          recordedBy: actor.id,
          verifiedBy: actor.id,
          verifiedAt: periodEnd,
          paidOn: (periodEnd).toISOString().slice(0, 10),
          note: 'Bulk seed',
          idempotencyKey: `seed-payment:${invoiceId}`,
          createdAt: now,
          updatedAt: now,
        })
        paymentEventRows.push({
          id: randomUUID(),
          paymentId,
          eventType: 'verified',
          actor: `admin:${actor.id}`,
          payload: { adapter: 'manual', method: 'bank_transfer', amountMinor: total, invoiceId },
          createdAt: now,
        })
      }
    }
    for (let index = 0; index < invoiceRows.length; index += 500) {
      await database.insert(invoices).values(invoiceRows.slice(index, index + 500) as never)
    }
    for (let index = 0; index < invLineRows.length; index += 500) {
      await database.insert(invoiceLines).values(invLineRows.slice(index, index + 500) as never)
    }
    for (let index = 0; index < invLineTaxRows.length; index += 500) {
      await database.insert(invoiceLineTaxes).values(invLineTaxRows.slice(index, index + 500) as never)
    }
    for (let index = 0; index < invTaxRows.length; index += 500) {
      await database.insert(invoiceTaxes).values(invTaxRows.slice(index, index + 500) as never)
    }
    for (let index = 0; index < paymentRows.length; index += 500) {
      await database.insert(payments).values(paymentRows.slice(index, index + 500) as never)
    }
    for (let index = 0; index < paymentEventRows.length; index += 500) {
      await database.insert(paymentEvents).values(paymentEventRows.slice(index, index + 500) as never)
    }
    await setCounter(database, 'invoice', invSeq)
    bulkSubs = subRows.length
    bulkInvoices = invoiceRows.length
  }

  console.log(`Seed done: core scenes + ${bulkSubs} bulk subscriptions, ${bulkInvoices} bulk invoices.`)
  console.log('Demo accounts (sign up in Clerk with these emails first):')
  console.log('  degeneratedestroyer58008@gmail.com -> admin: pnpm db:seed-admin degeneratedestroyer58008@gmail.com')
  console.log('  goeltanmay442@gmail.com -> customer: pnpm db:link-customer goeltanmay442@gmail.com')
  console.log('  customer-one@brightloop.example (customer, extra demo)')
  void tanmayActive
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
