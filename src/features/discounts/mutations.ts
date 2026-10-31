import { and, eq, inArray, sql } from 'drizzle-orm'

import type { Database, DbOrTx } from '../../db/client'
import type { PricingDiscountInput } from '../../domain/pricing'
import {
  discountProducts,
  discounts,
  subscriptionDiscounts,
} from '../../db/schema/discounts'
import type { DiscountRow } from '../../db/schema/discounts'
import type { UserRow } from '../../db/schema/users'
import { assertAdminRole, canActAsStaff, ForbiddenError } from '../../lib/auth'
import { getSubscription } from '../subscriptions/queries'

import { getDiscount, listDiscountsWithProducts } from './queries'
import type { DiscountAttachInput, DiscountInput, UpdateDiscountInput } from './schema'

function parseIsoDay(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00Z`)
}

async function replaceDiscountProducts(
  database: Database,
  discountId: string,
  productIds: string[],
) {
  await database.delete(discountProducts).where(eq(discountProducts.discountId, discountId))
  for (const productId of productIds) {
    await database.insert(discountProducts).values({ discountId, productId })
  }
}

export async function createDiscount(database: Database, actor: UserRow, input: DiscountInput) {
  assertAdminRole(actor.role)
  const inserted = await database
    .insert(discounts)
    .values({
      name: input.name,
      kind: input.kind,
      valueMinorOrBasisPoints: input.valueMinorOrBasisPoints,
      scope: input.scope,
      minPurchaseMinor: input.minPurchaseMinor ?? null,
      minQuantity: input.minQuantity ?? null,
      startsAt: input.startsAt ? parseIsoDay(input.startsAt) : null,
      endsAt: input.endsAt ? parseIsoDay(input.endsAt) : null,
      maxRedemptions: input.maxRedemptions ?? null,
      isActive: input.isActive,
    })
    .returning()
  if (inserted.length === 0) throw new Error('Discount insert lost its row')
  const created = inserted[0]
  await replaceDiscountProducts(database, created.id, input.productIds ?? [])
  return created
}

export async function updateDiscount(
  database: Database,
  actor: UserRow,
  input: UpdateDiscountInput,
) {
  assertAdminRole(actor.role)
  const existing = await getDiscount(database, input.id)
  if (!existing) throw new ForbiddenError()
  const updated = await database
    .update(discounts)
    .set({
      name: input.name,
      kind: input.kind,
      valueMinorOrBasisPoints: input.valueMinorOrBasisPoints,
      scope: input.scope,
      minPurchaseMinor: input.minPurchaseMinor ?? null,
      minQuantity: input.minQuantity ?? null,
      startsAt: input.startsAt ? parseIsoDay(input.startsAt) : null,
      endsAt: input.endsAt ? parseIsoDay(input.endsAt) : null,
      maxRedemptions: input.maxRedemptions ?? null,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(eq(discounts.id, input.id))
    .returning()
  if (updated.length === 0) throw new ForbiddenError()
  await replaceDiscountProducts(database, input.id, input.productIds ?? [])
  return updated[0]
}

export async function deleteDiscount(database: Database, actor: UserRow, discountId: string) {
  assertAdminRole(actor.role)
  const existing = await getDiscount(database, discountId)
  if (!existing) throw new ForbiddenError()
  const attached = await database.query.subscriptionDiscounts.findMany({
    where: eq(subscriptionDiscounts.discountId, discountId),
  })
  if (attached.length > 0 || existing.timesRedeemed > 0) {
    const archived = await database
      .update(discounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(discounts.id, discountId))
      .returning()
    return { archived: true as const, row: archived[0] }
  }
  await database.delete(discountProducts).where(eq(discountProducts.discountId, discountId))
  await database.delete(discounts).where(eq(discounts.id, discountId))
  return { archived: false as const, row: existing }
}

export async function attachDiscount(
  database: Database,
  actor: UserRow,
  input: DiscountAttachInput,
) {
  if (!canActAsStaff(actor.role)) throw new ForbiddenError()
  const discount = await getDiscount(database, input.discountId)
  if (!discount) throw new ForbiddenError()
  const subscription = await getSubscription(database, input.subscriptionId)
  if (!subscription) throw new ForbiddenError()
  const existingLink = await database.query.subscriptionDiscounts.findFirst({
    where: and(
      eq(subscriptionDiscounts.subscriptionId, input.subscriptionId),
      eq(subscriptionDiscounts.discountId, input.discountId),
    ),
  })
  if (existingLink) return existingLink
  const inserted = await database
    .insert(subscriptionDiscounts)
    .values({
      subscriptionId: input.subscriptionId,
      discountId: input.discountId,
      attachedBy: `${actor.role}:${actor.id}`,
    })
    .returning()
  if (inserted.length === 0) throw new Error('Discount attach lost its row')
  return inserted[0]
}

export async function detachDiscount(
  database: Database,
  actor: UserRow,
  input: DiscountAttachInput,
) {
  if (!canActAsStaff(actor.role)) throw new ForbiddenError()
  await database
    .delete(subscriptionDiscounts)
    .where(
      and(
        eq(subscriptionDiscounts.subscriptionId, input.subscriptionId),
        eq(subscriptionDiscounts.discountId, input.discountId),
      ),
    )
}

// Atomic claim for invoice-time redemption: one UPDATE...RETURNING is atomic
// in Postgres, so concurrent invoice runs cannot push times_redeemed past the
// cap. Returns the claimed row, or null when the rule is exhausted, inactive,
// or outside its window. Invoice generation treats null as "rule stopped".
export async function claimDiscountRedemption(
  database: DbOrTx,
  discountId: string,
  claimedAt: Date = new Date(),
): Promise<DiscountRow | null> {
  const claimed = await database
    .update(discounts)
    .set({ timesRedeemed: sql`${discounts.timesRedeemed} + 1`, updatedAt: claimedAt })
    .where(
      sql`${discounts.id} = ${discountId}
        AND ${discounts.isActive} = true
        AND (${discounts.startsAt} IS NULL OR ${discounts.startsAt} <= ${claimedAt})
        AND (${discounts.endsAt} IS NULL OR ${discounts.endsAt} >= ${claimedAt})
        AND (${discounts.maxRedemptions} IS NULL OR ${discounts.timesRedeemed} < ${discounts.maxRedemptions})`,
    )
    .returning()
  return claimed[0] ?? null
}

export async function loadPricingDiscounts(
  database: DbOrTx,
  discountIds: string[],
): Promise<PricingDiscountInput[]> {
  if (discountIds.length === 0) return []
  const rows = await database.query.discounts.findMany({
    where: inArray(discounts.id, discountIds),
  })
  const productsByDiscount = await listDiscountsWithProducts(database, discountIds)
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    valueMinorOrBasisPoints: row.valueMinorOrBasisPoints,
    scope: row.scope,
    productIds: productsByDiscount.get(row.id) ?? [],
    minPurchaseMinor: row.minPurchaseMinor,
    minQuantity: row.minQuantity,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    timesRedeemed: row.timesRedeemed,
    isActive: row.isActive,
  }))
}
