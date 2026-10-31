import { asc, eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { subscriptionLineTaxes } from '../../db/schema/subscriptions'
import { taxes } from '../../db/schema/taxes'
import { quotationTemplateLineTaxes } from '../../db/schema/templates'

export function listTaxes(database: Database) {
  return database.query.taxes.findMany({ orderBy: asc(taxes.createdAt) })
}

export function getTax(database: Database, taxId: string) {
  return database.query.taxes.findFirst({ where: eq(taxes.id, taxId) })
}

// Invoice line-tax tables land in Phase 05; extend this check to
// invoice_line_taxes there. Template and subscription lines are checked here.
export async function hasTaxReferences(database: Database, taxId: string): Promise<boolean> {
  const [templateLink, subscriptionLink] = await Promise.all([
    database.query.quotationTemplateLineTaxes.findFirst({
      where: eq(quotationTemplateLineTaxes.taxId, taxId),
    }),
    database.query.subscriptionLineTaxes.findFirst({
      where: eq(subscriptionLineTaxes.taxId, taxId),
    }),
  ])
  return templateLink !== undefined || subscriptionLink !== undefined
}
