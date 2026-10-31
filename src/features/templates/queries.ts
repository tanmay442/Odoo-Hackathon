import { asc, eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import {
  quotationTemplateLines,
  quotationTemplateLineTaxes,
  quotationTemplates,
} from '../../db/schema/templates'

export function listTemplates(database: Database) {
  return database.query.quotationTemplates.findMany({ orderBy: asc(quotationTemplates.createdAt) })
}

export function listActiveTemplates(database: Database) {
  return database.query.quotationTemplates.findMany({
    where: eq(quotationTemplates.isActive, true),
    orderBy: asc(quotationTemplates.createdAt),
  })
}

export function getTemplate(database: Database, templateId: string) {
  return database.query.quotationTemplates.findFirst({
    where: eq(quotationTemplates.id, templateId),
  })
}

export function listTemplateLines(database: Database, templateId: string) {
  return database.query.quotationTemplateLines.findMany({
    where: eq(quotationTemplateLines.templateId, templateId),
    orderBy: asc(quotationTemplateLines.createdAt),
  })
}

export function listTemplateLineTaxes(database: Database, templateLineId: string) {
  return database.query.quotationTemplateLineTaxes.findMany({
    where: eq(quotationTemplateLineTaxes.templateLineId, templateLineId),
  })
}

export async function getTemplateWithLines(database: Database, templateId: string) {
  const template = await getTemplate(database, templateId)
  if (!template) return null
  const lines = await listTemplateLines(database, templateId)
  const withTaxes = await Promise.all(
    lines.map(async (line) => ({
      ...line,
      taxIds: (await listTemplateLineTaxes(database, line.id)).map((row) => row.taxId),
    })),
  )
  return { ...template, lines: withTaxes }
}
