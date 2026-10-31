import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDatabase } from '../../src/db/client'
import { counters } from '../../src/db/schema/counters'
import { customers } from '../../src/db/schema/customers'
import { plans } from '../../src/db/schema/plans'
import { productVariants, products } from '../../src/db/schema/products'
import { staffInvites } from '../../src/db/schema/staff-invites'
import {
  subscriptionEvents,
  subscriptionLines,
  subscriptionLineTaxes,
  subscriptions
  
} from '../../src/db/schema/subscriptions'
import type {SubscriptionStatus} from '../../src/db/schema/subscriptions';
import {
  quotationTemplateLines,
  quotationTemplateLineTaxes,
  quotationTemplates,
} from '../../src/db/schema/templates'
import { taxes } from '../../src/db/schema/taxes'
import { users } from '../../src/db/schema/users'
import type { UserRow } from '../../src/db/schema/users'
import { ForbiddenError } from '../../src/lib/auth'
import { InvalidTransitionError } from '../../src/domain/state-machines'
import { PlanUnavailableError } from '../../src/features/plans/availability'
import { deletePlan, updatePlan } from '../../src/features/plans/mutations'
import { createProduct, updateProduct } from '../../src/features/products/mutations'
import { createTax } from '../../src/features/taxes/mutations'
import { ensureUserRecord } from '../../src/features/users/mutations'
import { createCustomer } from '../../src/features/customers/mutations'
import { createTemplate } from '../../src/features/templates/mutations'
import { createSubscription } from '../../src/features/subscriptions/mutations'
import { transitionSubscription } from '../../src/features/subscriptions/transitions'
import { getSubscriptionDetail } from '../../src/features/subscriptions/queries'

const database = getDatabase()

async function truncate() {
  await database.delete(subscriptionEvents)
  await database.delete(subscriptionLineTaxes)
  await database.delete(subscriptionLines)
  await database.delete(subscriptions)
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
  await database.update(counters).set({ value: 0 }).where(eq(counters.name, 'subscription'))
}

async function actorWithRole(clerkUserId: string, email: string, role: UserRow['role']) {
  const user = await ensureUserRecord(database, { clerkUserId, email, displayName: email })
  await database.update(users).set({ role }).where(eq(users.id, user.id))
  const reloaded = await ensureUserRecord(database, { clerkUserId, email, displayName: email })
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
  admin = await actorWithRole('user_sub_admin', 'sub-admin@example.com', 'admin')
  staff = await actorWithRole('user_sub_staff', 'sub-staff@example.com', 'staff')
})

async function seedProduct() {
  const product = await createProduct(database, admin, {
    name: 'Suite',
    type: 'software',
    salesPriceMinor: 100000,
    costPriceMinor: 40000,
    currency: 'INR',
    notes: null,
  })
  return product
}

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

async function seedSubscription(options: {
  planId: string
  customerId: string
  productId: string
  quantity?: number
  unitPriceMinor?: number
}) {
  return createSubscription(database, staff, {
    customerId: options.customerId,
    planId: options.planId,
    startDate: '2026-02-01',
    paymentTerms: null,
    sourceTemplateId: null,
    lines: [
      {
        productId: options.productId,
        variantId: null,
        description: '',
        quantity: options.quantity ?? 1,
        unitPriceMinor: options.unitPriceMinor ?? 100000,
        taxIds: [],
      },
    ],
  })
}

async function driveTo(subscriptionId: string, target: SubscriptionStatus) {
  const path: Record<SubscriptionStatus, SubscriptionStatus[]> = {
    draft: [],
    quotation: ['quotation'],
    confirmed: ['quotation', 'confirmed'],
    active: ['quotation', 'confirmed', 'active'],
    paused: ['quotation', 'confirmed', 'active', 'paused'],
    closed: ['quotation', 'confirmed', 'active', 'closed'],
  }
  for (const step of path[target]) {
    await transitionSubscription(database, staff, subscriptionId, step)
  }
}

const all: SubscriptionStatus[] = ['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed']

const legal: Array<[SubscriptionStatus, SubscriptionStatus]> = [
  ['draft', 'quotation'],
  ['draft', 'closed'],
  ['quotation', 'confirmed'],
  ['quotation', 'closed'],
  ['confirmed', 'active'],
  ['confirmed', 'closed'],
  ['active', 'closed'],
  ['active', 'paused'],
  ['paused', 'active'],
  ['paused', 'closed'],
  ['closed', 'active'],
]

describe('subscription transitions', () => {
  it('accepts every legal transition server-side', async () => {
    const product = await seedProduct()
    for (const [from, to] of legal) {
      const plan = await seedPlan()
      const customer = await seedCustomer()
      const created = await seedSubscription({ planId: plan.id, customerId: customer.id, productId: product.id })
      await driveTo(created.id, from)
      const moved = await transitionSubscription(database, staff, created.id, to)
      expect(moved.status).toBe(to)
    }
  })

  it('rejects every illegal transition server-side', async () => {
    const product = await seedProduct()
    const allowed = new Set(legal.map(([from, to]) => `${from}->${to}`))
    for (const from of all) {
      for (const to of all) {
        if (from === to) continue
        if (allowed.has(`${from}->${to}`)) continue
        const plan = await seedPlan()
        const customer = await seedCustomer()
        const created = await seedSubscription({ planId: plan.id, customerId: customer.id, productId: product.id })
        await driveTo(created.id, from)
        await expect(transitionSubscription(database, staff, created.id, to)).rejects.toBeInstanceOf(
          InvalidTransitionError,
        )
      }
    }
  })

  it('refuses pause when the plan forbids it', async () => {
    const product = await seedProduct()
    const plan = await seedPlan({ allowPause: false })
    const customer = await seedCustomer()
    const created = await seedSubscription({ planId: plan.id, customerId: customer.id, productId: product.id })
    await driveTo(created.id, 'active')
    await expect(transitionSubscription(database, staff, created.id, 'paused')).rejects.toBeInstanceOf(
      InvalidTransitionError,
    )
  })

  it('activates with period dates from the plan interval', async () => {
    const product = await seedProduct()
    const plan = await seedPlan({ billingInterval: 'monthly', intervalCount: 1 })
    const customer = await seedCustomer()
    const created = await seedSubscription({ planId: plan.id, customerId: customer.id, productId: product.id })
    await driveTo(created.id, 'confirmed')
    const activated = await transitionSubscription(database, staff, created.id, 'active')
    expect(activated.currentPeriodStart?.toISOString().slice(0, 10)).toBe('2026-02-01')
    expect(activated.currentPeriodEnd?.toISOString().slice(0, 10)).toBe('2026-03-01')
    expect(activated.nextBillingAt?.toISOString().slice(0, 10)).toBe('2026-03-01')
  })

  it('enforces the plan minimum quantity on lines', async () => {
    const product = await seedProduct()
    const plan = await seedPlan({ minQuantity: 5 })
    const customer = await seedCustomer()
    await expect(
      seedSubscription({ planId: plan.id, customerId: customer.id, productId: product.id, quantity: 2 }),
    ).rejects.toThrow()
  })

  it('refuses subscriptions from plans outside their availability window', async () => {
    const product = await seedProduct()
    const plan = await seedPlan({ availableFrom: new Date('2024-01-01T00:00:00Z'), availableTo: new Date('2024-12-31T00:00:00Z') })
    const customer = await seedCustomer()
    await expect(
      seedSubscription({ planId: plan.id, customerId: customer.id, productId: product.id }),
    ).rejects.toBeInstanceOf(PlanUnavailableError)
  })
})

describe('subscription numbers', () => {
  it('issues unique sequential numbers across ten concurrent creates', async () => {
    const product = await seedProduct()
    const plan = await seedPlan()
    const seededCustomers = await Promise.all(Array.from({ length: 10 }, () => seedCustomer()))
    const created = await Promise.all(
      seededCustomers.map((customer) =>
        seedSubscription({ planId: plan.id, customerId: customer.id, productId: product.id }),
      ),
    )
    const numbers = created.map((row) => row.number).sort()
    expect(new Set(numbers).size).toBe(10)
    expect(numbers).toEqual(
      Array.from({ length: 10 }, (_, index) => `SUB-${String(index + 1).padStart(6, '0')}`),
    )
  })
})

describe('subscription snapshots and templates', () => {
  it('keeps the line snapshot when the product price changes', async () => {
    const product = await seedProduct()
    const plan = await seedPlan()
    const customer = await seedCustomer()
    const created = await seedSubscription({
      planId: plan.id,
      customerId: customer.id,
      productId: product.id,
      unitPriceMinor: 100000,
    })
    await updateProduct(database, admin, {
      id: product.id,
      name: product.name,
      type: product.type,
      salesPriceMinor: 999000,
      costPriceMinor: product.costPriceMinor,
      currency: product.currency,
      notes: null,
    })
    const detail = await getSubscriptionDetail(database, created.id)
    expect(detail?.lines[0]?.unitPriceMinor).toBe(100000)
  })

  it('copies template lines and sets expiry from validity days', async () => {
    const product = await seedProduct()
    const tax = await createTax(database, admin, { name: 'GST', rateBasisPoints: 1800, isActive: true })
    const plan = await seedPlan()
    const customer = await seedCustomer()
    const template = await createTemplate(database, admin, {
      name: 'Starter',
      planId: plan.id,
      validityDays: 14,
      isActive: true,
      lines: [
        { productId: product.id, variantId: null, quantity: 2, unitPriceMinor: 100000, taxIds: [tax.id] },
      ],
    })
    const created = await createSubscription(database, staff, {
      customerId: customer.id,
      planId: plan.id,
      startDate: '2026-02-01',
      paymentTerms: null,
      sourceTemplateId: template.id,
      lines: [
        { productId: product.id, variantId: null, description: '', quantity: 1, unitPriceMinor: 1, taxIds: [] },
      ],
    })
    expect(created.sourceTemplateId).toBe(template.id)
    expect(created.expiryDate.toISOString().slice(0, 10)).toBe('2026-02-15')
    const detail = await getSubscriptionDetail(database, created.id)
    expect(detail?.lines).toHaveLength(1)
    expect(detail?.lines[0]?.quantity).toBe(2)
    expect(detail?.lines[0]?.unitPriceMinor).toBe(100000)
    expect(detail?.lines[0]?.taxIds).toEqual([tax.id])
  })
})

describe('plan guards use live subscriptions', () => {
  it('stamps the price change and archives instead of deleting', async () => {
    const product = await seedProduct()
    const plan = await seedPlan()
    const customer = await seedCustomer()
    await seedSubscription({ planId: plan.id, customerId: customer.id, productId: product.id })
    const updated = await updatePlan(database, admin, {
      name: plan.name,
      productId: null,
      priceMinor: 600000,
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
      id: plan.id,
    })
    expect(updated.priceChangedAt).not.toBeNull()
    expect(await deletePlan(database, admin, plan.id)).toEqual({ archived: true })
  })

  it('refuses customer writes and non-staff subscription writes', async () => {
    const customerUser = await actorWithRole('user_sub_customer', 'sub-customer@example.com', 'customer')
    const product = await seedProduct()
    const plan = await seedPlan()
    const customer = await seedCustomer()
    await expect(
      createSubscription(database, customerUser, {
        customerId: customer.id,
        planId: plan.id,
        startDate: '2026-02-01',
        paymentTerms: null,
        sourceTemplateId: null,
        lines: [
          { productId: product.id, variantId: null, description: '', quantity: 1, unitPriceMinor: 1, taxIds: [] },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})
