import { asc, eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { taxes } from '../../db/schema/taxes'

export function listTaxes(database: Database) {
  return database.query.taxes.findMany({ orderBy: asc(taxes.createdAt) })
}

export function getTax(database: Database, taxId: string) {
  return database.query.taxes.findFirst({ where: eq(taxes.id, taxId) })
}

// Phase 04 owns the invoice line-tax tables; this stub keeps the delete
// guard compiling until the real reference check lands.
export async function hasTaxReferences(_database: Database, _taxId: string): Promise<boolean> {
  return false
}
