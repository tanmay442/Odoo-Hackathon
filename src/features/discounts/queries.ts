import { and, asc, eq, inArray } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { discountProducts, discounts, subscriptionDiscounts } from '../../db/schema/discounts'

export function listDiscounts(database: Database) {
  return database.query.discounts.findMany({ orderBy: asc(discounts.createdAt) })
}

export function getDiscount(database: Database, discountId: string) {
  return database.query.discounts.findFirst({ where: eq(discounts.id, discountId) })
}

export function listDiscountProducts(database: Database, discountId: string) {
  return database.query.discountProducts.findMany({
    where: eq(discountProducts.discountId, discountId),
  })
}

export async function listDiscountsWithProducts(database: Database, discountIds: string[]) {
  if (discountIds.length === 0) return new Map<string, string[]>()
  const rows = await database.query.discountProducts.findMany({
    where: inArray(discountProducts.discountId, discountIds),
  })
  const byDiscount = new Map<string, string[]>()
  for (const row of rows) {
    const productIds = byDiscount.get(row.discountId) ?? []
    productIds.push(row.productId)
    byDiscount.set(row.discountId, productIds)
  }
  return byDiscount
}

export function listSubscriptionDiscounts(database: Database, subscriptionId: string) {
  return database.query.subscriptionDiscounts.findMany({
    where: eq(subscriptionDiscounts.subscriptionId, subscriptionId),
  })
}

export function listAttachedDiscounts(database: Database, subscriptionId: string) {
  return database.query.subscriptionDiscounts.findMany({
    where: eq(subscriptionDiscounts.subscriptionId, subscriptionId),
    orderBy: asc(subscriptionDiscounts.attachedAt),
  })
}

export async function listSubscriptionDiscountRows(database: Database, subscriptionId: string) {
  const links = await listSubscriptionDiscounts(database, subscriptionId)
  if (links.length === 0) return []
  const rows = await database.query.discounts.findMany({
    where: inArray(
      discounts.id,
      links.map((link) => link.discountId),
    ),
  })
  return rows.filter((row) =>
    links.some((link) => link.discountId === row.id),
  )
}

export function findSubscriptionDiscount(
  database: Database,
  subscriptionId: string,
  discountId: string,
) {
  return database.query.subscriptionDiscounts.findFirst({
    where: and(
      eq(subscriptionDiscounts.subscriptionId, subscriptionId),
      eq(subscriptionDiscounts.discountId, discountId),
    ),
  })
}
