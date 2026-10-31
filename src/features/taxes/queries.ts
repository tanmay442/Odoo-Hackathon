import { asc, eq } from 'drizzle-orm'

import type { Database, DbOrTx } from '../../db/client'
import { invoiceLineTaxes } from '../../db/schema/invoices'
import { subscriptionLineTaxes } from '../../db/schema/subscriptions'
import { taxes } from '../../db/schema/taxes'
import { quotationTemplateLineTaxes } from '../../db/schema/templates'

export function listTaxes(database: Database) {
  return database.query.taxes.findMany({ orderBy: asc(taxes.createdAt) })
}

export function getTax(database: Database, taxId: string) {
  return database.query.taxes.findFirst({ where: eq(taxes.id, taxId) })
}

// Template, subscription, and invoice lines are checked here. Invoice rows
// are frozen snapshots, so a referenced tax stays queryable but leaves the
// editable set exactly like live-line references do.
export async function hasTaxReferences(database: Database | DbOrTx, taxId: string): Promise<boolean> {
  const [templateLink, subscriptionLink, invoiceLink] = await Promise.all([
    database.query.quotationTemplateLineTaxes.findFirst({
      where: eq(quotationTemplateLineTaxes.taxId, taxId),
    }),
    database.query.subscriptionLineTaxes.findFirst({
      where: eq(subscriptionLineTaxes.taxId, taxId),
    }),
    database.query.invoiceLineTaxes.findFirst({
      where: eq(invoiceLineTaxes.taxId, taxId),
    }),
  ])
  return templateLink !== undefined || subscriptionLink !== undefined || invoiceLink !== undefined
}
