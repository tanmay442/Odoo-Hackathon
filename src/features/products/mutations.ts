import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { productVariants, products } from '../../db/schema/products'
import type { UserRow } from '../../db/schema/users'
import { assertAdminRole, ForbiddenError } from '../../lib/auth'

import { countVariants, getProduct } from './queries'
import type { ProductInput, UpdateProductInput, UpdateVariantInput, VariantInput } from './schema'

export async function createProduct(database: Database, actor: UserRow, input: ProductInput) {
  assertAdminRole(actor.role)
  const inserted = await database
    .insert(products)
    .values({
      name: input.name,
      type: input.type,
      salesPriceMinor: input.salesPriceMinor,
      costPriceMinor: input.costPriceMinor,
      currency: input.currency ?? 'INR',
      notes: input.notes ?? null,
    })
    .returning()
  if (inserted.length === 0) throw new Error('Product insert lost its row')
  return inserted[0]
}

export async function updateProduct(database: Database, actor: UserRow, input: UpdateProductInput) {
  assertAdminRole(actor.role)
  const existing = await getProduct(database, input.id)
  if (!existing) throw new ForbiddenError()
  const updated = await database
    .update(products)
    .set({
      name: input.name,
      type: input.type,
      salesPriceMinor: input.salesPriceMinor,
      costPriceMinor: input.costPriceMinor,
      currency: input.currency ?? 'INR',
      notes: input.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(products.id, input.id))
    .returning()
  if (updated.length === 0) throw new ForbiddenError()
  return updated[0]
}

export interface DeleteProductResult {
  archived: boolean
}

// A product with variants stays queryable but leaves the editable set:
// archive instead of delete when referenced.
export async function deleteProduct(
  database: Database,
  actor: UserRow,
  productId: string,
): Promise<DeleteProductResult> {
  assertAdminRole(actor.role)
  const existing = await getProduct(database, productId)
  if (!existing) throw new ForbiddenError()
  if ((await countVariants(database, productId)) > 0) {
    await database
      .update(products)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(products.id, productId))
    return { archived: true }
  }
  await database.delete(products).where(eq(products.id, productId))
  return { archived: false }
}

export async function restoreProduct(database: Database, actor: UserRow, productId: string) {
  assertAdminRole(actor.role)
  const restored = await database
    .update(products)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(products.id, productId))
    .returning()
  if (restored.length === 0) throw new ForbiddenError()
  return restored[0]
}

export async function createVariant(database: Database, actor: UserRow, input: VariantInput) {
  assertAdminRole(actor.role)
  const product = await getProduct(database, input.productId)
  if (!product) throw new ForbiddenError()
  const inserted = await database
    .insert(productVariants)
    .values({ productId: input.productId, name: input.name, priceDeltaMinor: input.priceDeltaMinor })
    .returning()
  if (inserted.length === 0) throw new Error('Variant insert lost its row')
  return inserted[0]
}

export async function updateVariant(database: Database, actor: UserRow, input: UpdateVariantInput) {
  assertAdminRole(actor.role)
  const updated = await database
    .update(productVariants)
    .set({ name: input.name, priceDeltaMinor: input.priceDeltaMinor, updatedAt: new Date() })
    .where(eq(productVariants.id, input.id))
    .returning()
  if (updated.length === 0) throw new ForbiddenError()
  return updated[0]
}

export async function deleteVariant(database: Database, actor: UserRow, variantId: string) {
  assertAdminRole(actor.role)
  const deleted = await database
    .delete(productVariants)
    .where(eq(productVariants.id, variantId))
    .returning()
  if (deleted.length === 0) throw new ForbiddenError()
}
