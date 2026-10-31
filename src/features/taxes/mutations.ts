import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import type { UserRow } from '../../db/schema/users'
import { taxes } from '../../db/schema/taxes'
import { assertAdminRole, ForbiddenError } from '../../lib/auth'

import { getTax, hasTaxReferences } from './queries'
import type { TaxInput, UpdateTaxInput } from './schema'

export async function createTax(database: Database, actor: UserRow, input: TaxInput) {
  assertAdminRole(actor.role)
  const inserted = await database
    .insert(taxes)
    .values({ name: input.name, rateBasisPoints: input.rateBasisPoints, isActive: input.isActive })
    .returning()
  if (inserted.length === 0) throw new Error('Tax insert lost its row')
  return inserted[0]
}

export async function updateTax(database: Database, actor: UserRow, input: UpdateTaxInput) {
  assertAdminRole(actor.role)
  const existing = await getTax(database, input.id)
  if (!existing) throw new ForbiddenError()
  const updated = await database
    .update(taxes)
    .set({
      name: input.name,
      rateBasisPoints: input.rateBasisPoints,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(eq(taxes.id, input.id))
    .returning()
  if (updated.length === 0) throw new ForbiddenError()
  return updated[0]
}

export interface DeleteTaxResult {
  archived: boolean
}

// A tax on live lines stays queryable but leaves the editable set: it is
// deactivated instead of deleted when referenced. Deactivation never
// changes confirmed invoices, and inactive taxes cannot be picked.
export async function deleteTax(
  database: Database,
  actor: UserRow,
  taxId: string,
): Promise<DeleteTaxResult> {
  assertAdminRole(actor.role)
  const existing = await getTax(database, taxId)
  if (!existing) throw new ForbiddenError()
  if (await hasTaxReferences(database, taxId)) {
    await database
      .update(taxes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(taxes.id, taxId))
    return { archived: true }
  }
  await database.delete(taxes).where(eq(taxes.id, taxId))
  return { archived: false }
}

export async function restoreTax(database: Database, actor: UserRow, taxId: string) {
  assertAdminRole(actor.role)
  const restored = await database
    .update(taxes)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(taxes.id, taxId))
    .returning()
  if (restored.length === 0) throw new ForbiddenError()
  return restored[0]
}
