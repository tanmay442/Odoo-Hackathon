import { asc, eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { productVariants, products } from '../../db/schema/products'

export function listProducts(database: Database) {
  return database.query.products.findMany({ orderBy: asc(products.createdAt) })
}

export function getProduct(database: Database, productId: string) {
  return database.query.products.findFirst({ where: eq(products.id, productId) })
}

export function listVariants(database: Database, productId: string) {
  return database.query.productVariants.findMany({
    where: eq(productVariants.productId, productId),
    orderBy: asc(productVariants.createdAt),
  })
}

export async function countVariants(database: Database, productId: string): Promise<number> {
  return (await listVariants(database, productId)).length
}
