import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDatabase } from '../../src/db/client'
import { customers } from '../../src/db/schema/customers'
import { discountProducts, discounts, subscriptionDiscounts } from '../../src/db/schema/discounts'
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
import {
  attachDiscount,
  claimDiscountRedemption,
  createDiscount,
  deleteDiscount,
  detachDiscount,
} from '../../src/features/discounts/mutations'
import { buildNextInvoicePreview } from '../../src/features/discounts/preview'
import { hasTaxReferences } from '../../src/features/taxes/queries'
import { createCustomer } from '../../src/features/customers/mutations'
import { createProduct } from '../../src/features/products/mutations'
import { createSubscription } from '../../src/features/subscriptions/mutations'
import { createTax } from '../../src/features/taxes/mutations'
import { ensureUserRecord } from '../../src/features/users/mutations'
import { ForbiddenError } from '../../src/lib/auth'

const database = getDatabase()

async function truncate() {
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
let customer: UserRow

beforeAll(async () => {
  await truncate()
})

beforeEach(async () => {
  await truncate()
  admin = await actorWithRole('user_discount_admin', 'discount-admin@example.com', 'admin')
  staff = await actorWithRole('user_discount_staff', 'discount-staff@example.com', 'staff')
  customer = await actorWithRole('user_discount_customer', 'discount-customer@example.com', 'customer')
})

async function seedPlan() {
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
  lines: Array<{ productId: string; quantity: number; unitPriceMinor: number; taxIds: string[] }>
}) {
  return createSubscription(database, staff, {
    customerId: options.customerId,
    planId: options.planId,
    startDate: '2026-02-01',
    paymentTerms: null,
    sourceTemplateId: null,
    lines: options.lines.map((line) => ({
      productId: line.productId,
      variantId: null,
      description: '',
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxIds: line.taxIds,
    })),
  })
}

describe('discount rules', () => {
  it('lets admins create rules but refuses staff with 403', async () => {
    const created = await createDiscount(database, admin, {
      name: 'Volume 10',
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
    expect(created.name).toBe('Volume 10')
    await expect(
      createDiscount(database, staff, {
        name: 'Staff rule',
        kind: 'fixed',
        valueMinorOrBasisPoints: 100,
        scope: 'subscription',
        productIds: [],
        minPurchaseMinor: null,
        minQuantity: null,
        startsAt: null,
        endsAt: null,
        maxRedemptions: null,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('deactivates instead of deleting a rule that is attached or redeemed', async () => {
    const plan = await seedPlan()
    const buyer = await seedCustomer()
    const product = await createProduct(database, admin, {
      name: 'Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
      notes: null,
    })
    const rule = await createDiscount(database, admin, {
      name: 'Capped',
      kind: 'fixed',
      valueMinorOrBasisPoints: 500,
      scope: 'subscription',
      productIds: [],
      minPurchaseMinor: null,
      minQuantity: null,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 1,
      isActive: true,
    })
    const subscription = await seedSubscription({
      planId: plan.id,
      customerId: buyer.id,
      lines: [{ productId: product.id, quantity: 1, unitPriceMinor: 100000, taxIds: [] }],
    })
    await attachDiscount(database, staff, { subscriptionId: subscription.id, discountId: rule.id })
    const deleted = await deleteDiscount(database, admin, rule.id)
    expect(deleted.archived).toBe(true)
    const stored = await database.query.discounts.findFirst({ where: eq(discounts.id, rule.id) })
    expect(stored?.isActive).toBe(false)
  })

  it('lets staff attach and detach, but refuses customers', async () => {
    const plan = await seedPlan()
    const buyer = await seedCustomer()
    const product = await createProduct(database, admin, {
      name: 'Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
      notes: null,
    })
    const rule = await createDiscount(database, admin, {
      name: 'Staff attach',
      kind: 'fixed',
      valueMinorOrBasisPoints: 500,
      scope: 'subscription',
      productIds: [],
      minPurchaseMinor: null,
      minQuantity: null,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      isActive: true,
    })
    const subscription = await seedSubscription({
      planId: plan.id,
      customerId: buyer.id,
      lines: [{ productId: product.id, quantity: 1, unitPriceMinor: 100000, taxIds: [] }],
    })
    await attachDiscount(database, staff, { subscriptionId: subscription.id, discountId: rule.id })
    await attachDiscount(database, staff, { subscriptionId: subscription.id, discountId: rule.id })
    const links = await database.query.subscriptionDiscounts.findMany({
      where: eq(subscriptionDiscounts.subscriptionId, subscription.id),
    })
    expect(links).toHaveLength(1)
    await expect(
      attachDiscount(database, customer, { subscriptionId: subscription.id, discountId: rule.id }),
    ).rejects.toBeInstanceOf(ForbiddenError)
    await detachDiscount(database, staff, { subscriptionId: subscription.id, discountId: rule.id })
    const after = await database.query.subscriptionDiscounts.findMany({
      where: eq(subscriptionDiscounts.subscriptionId, subscription.id),
    })
    expect(after).toHaveLength(0)
  })
})

describe('next invoice preview', () => {
  it('equals the hand-computed fixture totals', async () => {
    const taxLow = await createTax(database, admin, {
      name: 'GST 5%',
      rateBasisPoints: 500,
      isActive: true,
    })
    const taxHigh = await createTax(database, admin, {
      name: 'GST 18%',
      rateBasisPoints: 1800,
      isActive: true,
    })
    const productA = await createProduct(database, admin, {
      name: 'Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
      notes: null,
    })
    const productB = await createProduct(database, admin, {
      name: 'Addon',
      type: 'software',
      salesPriceMinor: 50000,
      costPriceMinor: 10000,
      currency: 'INR',
      notes: null,
    })
    const plan = await seedPlan()
    const buyer = await seedCustomer()
    const subscription = await seedSubscription({
      planId: plan.id,
      customerId: buyer.id,
      lines: [
        { productId: productA.id, quantity: 2, unitPriceMinor: 100000, taxIds: [taxHigh.id] },
        { productId: productB.id, quantity: 1, unitPriceMinor: 50000, taxIds: [taxLow.id] },
      ],
    })
    const rule = await createDiscount(database, admin, {
      name: 'Volume 10',
      kind: 'percentage',
      valueMinorOrBasisPoints: 1000,
      scope: 'subscription',
      productIds: [],
      minPurchaseMinor: 250000,
      minQuantity: null,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      isActive: true,
    })
    await attachDiscount(database, staff, { subscriptionId: subscription.id, discountId: rule.id })

    const preview = await buildNextInvoicePreview(database, subscription.id)

    expect(preview.subtotalMinor).toBe(250000)
    expect(preview.discountMinor).toBe(25000)
    expect(preview.discounts).toEqual([{ discountId: rule.id, name: 'Volume 10', amountMinor: 25000, discardedMinor: 0 }])
    expect(preview.taxSummary).toEqual([
      { rateBasisPoints: 500, taxIds: [taxLow.id], taxableMinor: 45000, taxMinor: 2250 },
      { rateBasisPoints: 1800, taxIds: [taxHigh.id], taxableMinor: 180000, taxMinor: 32400 },
    ])
    expect(preview.taxMinor).toBe(34650)
    expect(preview.totalMinor).toBe(259650)
    expect(preview.lines.map((row) => row.productName).sort()).toEqual(['Addon', 'Suite'])
  })

  it('auto-applies product discounts without an attach row and skips missed minimums', async () => {
    const productA = await createProduct(database, admin, {
      name: 'Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
      notes: null,
    })
    const productB = await createProduct(database, admin, {
      name: 'Addon',
      type: 'software',
      salesPriceMinor: 50000,
      costPriceMinor: 10000,
      currency: 'INR',
      notes: null,
    })
    const plan = await seedPlan()
    const buyer = await seedCustomer()
    const subscription = await seedSubscription({
      planId: plan.id,
      customerId: buyer.id,
      lines: [
        { productId: productA.id, quantity: 1, unitPriceMinor: 100000, taxIds: [] },
        { productId: productB.id, quantity: 1, unitPriceMinor: 50000, taxIds: [] },
      ],
    })
    await createDiscount(database, admin, {
      name: 'Suite deal',
      kind: 'fixed',
      valueMinorOrBasisPoints: 10000,
      scope: 'product',
      productIds: [productA.id],
      minPurchaseMinor: null,
      minQuantity: null,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      isActive: true,
    })
    await createDiscount(database, admin, {
      name: 'Too rich',
      kind: 'percentage',
      valueMinorOrBasisPoints: 5000,
      scope: 'subscription',
      productIds: [],
      minPurchaseMinor: 999999999,
      minQuantity: null,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      isActive: true,
    })
    await createDiscount(database, admin, {
      name: 'Expired',
      kind: 'percentage',
      valueMinorOrBasisPoints: 5000,
      scope: 'subscription',
      productIds: [],
      minPurchaseMinor: null,
      minQuantity: null,
      startsAt: null,
      endsAt: '2020-01-01',
      maxRedemptions: null,
      isActive: true,
    })

    const preview = await buildNextInvoicePreview(database, subscription.id)

    expect(preview.subtotalMinor).toBe(150000)
    expect(preview.discountMinor).toBe(10000)
    expect(preview.discounts).toHaveLength(1)
    expect(preview.discounts[0].name).toBe('Suite deal')
    expect(preview.totalMinor).toBe(140000)
  })
})

describe('redemption claims under concurrency', () => {
  it('holds the cap when ten invoice runs claim at once', async () => {
    const rule = await createDiscount(database, admin, {
      name: 'First three',
      kind: 'percentage',
      valueMinorOrBasisPoints: 1000,
      scope: 'subscription',
      productIds: [],
      minPurchaseMinor: null,
      minQuantity: null,
      startsAt: null,
      endsAt: null,
      maxRedemptions: 3,
      isActive: true,
    })
    const results = await Promise.all(
      Array.from({ length: 10 }, () => claimDiscountRedemption(database, rule.id)),
    )
    expect(results.filter((row) => row !== null)).toHaveLength(3)
    const stored = await database.query.discounts.findFirst({ where: eq(discounts.id, rule.id) })
    expect(stored?.timesRedeemed).toBe(3)
    expect(await claimDiscountRedemption(database, rule.id)).toBeNull()
  })
})

describe('tax reference check', () => {
  it('finds taxes used on subscription lines', async () => {
    const live = await createTax(database, admin, {
      name: 'GST 18%',
      rateBasisPoints: 1800,
      isActive: true,
    })
    const unused = await createTax(database, admin, {
      name: 'Unused 5%',
      rateBasisPoints: 500,
      isActive: true,
    })
    expect(await hasTaxReferences(database, unused.id)).toBe(false)
    const product = await createProduct(database, admin, {
      name: 'Suite',
      type: 'software',
      salesPriceMinor: 100000,
      costPriceMinor: 40000,
      currency: 'INR',
      notes: null,
    })
    const plan = await seedPlan()
    const buyer = await seedCustomer()
    await seedSubscription({
      planId: plan.id,
      customerId: buyer.id,
      lines: [{ productId: product.id, quantity: 1, unitPriceMinor: 100000, taxIds: [live.id] }],
    })
    expect(await hasTaxReferences(database, live.id)).toBe(true)
  })
})
