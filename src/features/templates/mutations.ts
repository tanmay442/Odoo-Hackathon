import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import {
  quotationTemplateLines,
  quotationTemplateLineTaxes,
  quotationTemplates,
} from '../../db/schema/templates'
import type { UserRow } from '../../db/schema/users'
import { assertAdminRole, canActAsStaff, ForbiddenError } from '../../lib/auth'
import { effectiveVariantPrice } from '../../domain/money'
import { getProduct, listVariants } from '../products/queries'
import { getTax } from '../taxes/queries'
import { getPlan } from '../plans/queries'

import { getTemplate, listTemplateLines } from './queries'
import type { TemplateInput, UpdateTemplateInput } from './schema'

async function validateTemplateLines(
  database: Database,
  planId: string,
  lines: UpdateTemplateInput['lines'],
): Promise<void> {
  const plan = await getPlan(database, planId)
  if (!plan) throw new ForbiddenError()
  for (const line of lines) {
    const product = await getProduct(database, line.productId)
    if (!product || product.archivedAt !== null) throw new ForbiddenError()
    if (line.quantity < plan.minQuantity) throw new ForbiddenError()
    if (line.variantId) {
      const variants = await listVariants(database, line.productId)
      if (!variants.some((variant) => variant.id === line.variantId)) throw new ForbiddenError()
    }
    for (const taxId of line.taxIds ?? []) {
      const tax = await getTax(database, taxId)
      if (!tax || !tax.isActive) throw new ForbiddenError()
    }
    if (line.unitPriceMinor < 0) throw new ForbiddenError()
  }
}

export function resolveTemplateLinePrice(
  salesPriceMinor: number,
  variantDeltaMinor: number | null,
  overrideMinor?: number,
): number {
  if (overrideMinor !== undefined) return overrideMinor
  if (variantDeltaMinor === null) return salesPriceMinor
  return effectiveVariantPrice(salesPriceMinor, variantDeltaMinor)
}

export async function createTemplate(database: Database, actor: UserRow, input: TemplateInput) {
  assertAdminRole(actor.role)
  await validateTemplateLines(database, input.planId, input.lines)
  const inserted = await database
    .insert(quotationTemplates)
    .values({
      name: input.name.trim(),
      planId: input.planId,
      validityDays: input.validityDays,
      isActive: input.isActive,
    })
    .returning()
  if (inserted.length === 0) throw new Error('Template insert lost its row')
  const template = inserted[0]
  try {
    for (const line of input.lines) {
      const insertedLines = await database
        .insert(quotationTemplateLines)
        .values({
          templateId: template.id,
          productId: line.productId,
          variantId: line.variantId ?? null,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
        })
        .returning()
      if (insertedLines.length === 0) throw new Error('Template line insert lost its row')
      const created = insertedLines[0]
      for (const taxId of line.taxIds ?? []) {
        await database.insert(quotationTemplateLineTaxes).values({ templateLineId: created.id, taxId })
      }
    }
  } catch (error) {
    for (const existingLine of await listTemplateLines(database, template.id)) {
      await database
        .delete(quotationTemplateLineTaxes)
        .where(eq(quotationTemplateLineTaxes.templateLineId, existingLine.id))
      await database.delete(quotationTemplateLines).where(eq(quotationTemplateLines.id, existingLine.id))
    }
    await database.delete(quotationTemplates).where(eq(quotationTemplates.id, template.id))
    throw error
  }
  return template
}

export async function updateTemplate(database: Database, actor: UserRow, input: UpdateTemplateInput) {
  assertAdminRole(actor.role)
  const existing = await getTemplate(database, input.id)
  if (!existing) throw new ForbiddenError()
  await validateTemplateLines(database, input.planId, input.lines)
  const updated = await database
    .update(quotationTemplates)
    .set({
      name: input.name.trim(),
      planId: input.planId,
      validityDays: input.validityDays,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(eq(quotationTemplates.id, input.id))
    .returning()
  if (updated.length === 0) throw new ForbiddenError()
  const priorLines = await listTemplateLines(database, input.id)
  for (const prior of priorLines) {
    await database
      .delete(quotationTemplateLineTaxes)
      .where(eq(quotationTemplateLineTaxes.templateLineId, prior.id))
  }
  for (const prior of priorLines) {
    await database.delete(quotationTemplateLines).where(eq(quotationTemplateLines.id, prior.id))
  }
  for (const line of input.lines) {
    const insertedLines = await database
      .insert(quotationTemplateLines)
      .values({
        templateId: input.id,
        productId: line.productId,
        variantId: line.variantId ?? null,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
      })
      .returning()
    if (insertedLines.length === 0) throw new Error('Template line insert lost its row')
    const created = insertedLines[0]
    for (const taxId of line.taxIds ?? []) {
      await database.insert(quotationTemplateLineTaxes).values({ templateLineId: created.id, taxId })
    }
  }
  return updated[0]
}

export async function deleteTemplate(database: Database, actor: UserRow, templateId: string) {
  assertAdminRole(actor.role)
  const existing = await getTemplate(database, templateId)
  if (!existing) throw new ForbiddenError()
  const lines = await listTemplateLines(database, templateId)
  for (const line of lines) {
    await database
      .delete(quotationTemplateLineTaxes)
      .where(eq(quotationTemplateLineTaxes.templateLineId, line.id))
  }
  for (const line of lines) {
    await database.delete(quotationTemplateLines).where(eq(quotationTemplateLines.id, line.id))
  }
  await database.delete(quotationTemplates).where(eq(quotationTemplates.id, templateId))
}

export function assertStaffCanReadTemplates(role: UserRow['role']): void {
  if (!canActAsStaff(role)) throw new ForbiddenError()
}
