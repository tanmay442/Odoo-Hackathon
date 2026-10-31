import { sql, eq  } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { counters } from '../../db/schema/counters'
import {
  subscriptionEvents,
  subscriptionLines,
  subscriptionLineTaxes,
  subscriptions,
} from '../../db/schema/subscriptions'
import type { UserRow } from '../../db/schema/users'
import { canActAsStaff, ForbiddenError } from '../../lib/auth'
import { addPeriod } from '../../domain/periods'
import { assertPlanAvailableForNewSubscription } from '../plans/availability'
import { getPlan } from '../plans/queries'
import { getCustomer } from '../customers/queries'
import { getProduct, listVariants } from '../products/queries'
import { getTax } from '../taxes/queries'
import { getTemplateWithLines } from '../templates/queries'

import { getSubscription, listSubscriptionLines } from './queries'
import type { SubscriptionCreateInput, SubscriptionLineInput } from './schema'

export class SubscriptionValidationError extends Error {
  readonly code = 'SUBSCRIPTION_INVALID'
  readonly status = 422

  constructor(message: string) {
    super(message)
    this.name = 'SubscriptionValidationError'
  }
}

export function formatSubscriptionNumber(value: number): string {
  return `SUB-${String(value).padStart(6, '0')}`
}

// Single UPDATE...RETURNING is atomic in Postgres, so ten concurrent
// creates each receive a distinct value even without a transaction.
export async function nextSubscriptionNumber(database: Database): Promise<string> {
  await database
    .insert(counters)
    .values({ name: 'subscription', value: 0 })
    .onConflictDoNothing({ target: counters.name })
  const updated = (await database.execute(
    sql`UPDATE counters SET value = value + 1 WHERE name = 'subscription' RETURNING value`,
  )) as unknown as Array<{ value: number }> | { rows: Array<{ value: number }> }
  const value = Array.isArray(updated) ? updated[0]?.value : updated.rows[0]?.value
  if (typeof value !== 'number') throw new Error('Counter update lost its row')
  return formatSubscriptionNumber(value)
}

function parseStartDate(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00Z`)
}

async function validateLines(
  database: Database,
  planId: string,
  lines: SubscriptionLineInput[],
): Promise<void> {
  const plan = await getPlan(database, planId)
  if (!plan) throw new ForbiddenError()
  for (const line of lines) {
    if (line.quantity < plan.minQuantity) {
      throw new SubscriptionValidationError(
        `Quantity ${line.quantity} is below the plan minimum of ${plan.minQuantity}`,
      )
    }
    const product = await getProduct(database, line.productId)
    if (!product || product.archivedAt !== null) throw new ForbiddenError()
    if (line.variantId) {
      const variants = await listVariants(database, line.productId)
      if (!variants.some((variant) => variant.id === line.variantId)) throw new ForbiddenError()
    }
    for (const taxId of line.taxIds ?? []) {
      const tax = await getTax(database, taxId)
      if (!tax || !tax.isActive) throw new ForbiddenError()
    }
  }
}

async function insertLines(
  database: Database,
  subscriptionId: string,
  lines: SubscriptionLineInput[],
): Promise<void> {
  for (const line of lines) {
    const inserted = await database
      .insert(subscriptionLines)
      .values({
        subscriptionId,
        productId: line.productId,
        variantId: line.variantId ?? null,
        description: line.description ?? '',
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
      })
      .returning()
    if (inserted.length === 0) throw new Error('Subscription line insert lost its row')
    const created = inserted[0]
    for (const taxId of line.taxIds ?? []) {
      await database.insert(subscriptionLineTaxes).values({ subscriptionLineId: created.id, taxId })
    }
  }
}

async function recordEvent(
  database: Database,
  subscriptionId: string,
  eventType: string,
  actor: UserRow,
): Promise<void> {
  await database.insert(subscriptionEvents).values({
    subscriptionId,
    eventType,
    actor: `${actor.role}:${actor.id}`,
    payload: null,
  })
}

export async function createSubscription(
  database: Database,
  actor: UserRow,
  input: SubscriptionCreateInput,
) {
  if (!canActAsStaff(actor.role)) throw new ForbiddenError()
  const customer = await getCustomer(database, input.customerId)
  if (!customer) throw new ForbiddenError()
  const plan = await getPlan(database, input.planId)
  if (!plan) throw new ForbiddenError()
  assertPlanAvailableForNewSubscription(plan, new Date())
  let lines = input.lines
  const sourceTemplateId: string | null = input.sourceTemplateId ?? null
  let expiryDate = addPeriod(parseStartDate(input.startDate), plan.billingInterval, plan.intervalCount)
  if (input.sourceTemplateId) {
    const template = await getTemplateWithLines(database, input.sourceTemplateId)
    if (!template || template.planId !== input.planId) throw new ForbiddenError()
    lines = template.lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      description: '',
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxIds: line.taxIds,
    }))
    const start = parseStartDate(input.startDate)
    expiryDate = new Date(start.getTime() + template.validityDays * 86_400_000)
  }
  await validateLines(database, input.planId, lines)
  const number = await nextSubscriptionNumber(database)
  const inserted = await database
    .insert(subscriptions)
    .values({
      number,
      customerId: input.customerId,
      planId: input.planId,
      status: 'draft',
      startDate: parseStartDate(input.startDate),
      expiryDate,
      paymentTerms: input.paymentTerms?.trim() ? input.paymentTerms.trim() : null,
      sourceTemplateId,
    })
    .returning()
  if (inserted.length === 0) throw new Error('Subscription insert lost its row')
  const created = inserted[0]
  try {
    await insertLines(database, created.id, lines)
    await recordEvent(database, created.id, 'created', actor)
  } catch (error) {
    const existingLines = await listSubscriptionLines(database, created.id)
    for (const line of existingLines) {
      await database
        .delete(subscriptionLineTaxes)
        .where(eq(subscriptionLineTaxes.subscriptionLineId, line.id))
      await database.delete(subscriptionLines).where(eq(subscriptionLines.id, line.id))
    }
    await database.delete(subscriptions).where(eq(subscriptions.id, created.id))
    throw error
  }
  return created
}

export async function updateSubscriptionLines(
  database: Database,
  actor: UserRow,
  subscriptionId: string,
  lines: SubscriptionLineInput[],
) {
  if (!canActAsStaff(actor.role)) throw new ForbiddenError()
  const existing = await getSubscription(database, subscriptionId)
  if (!existing) throw new ForbiddenError()
  if (existing.status !== 'draft' && existing.status !== 'quotation') throw new ForbiddenError()
  await validateLines(database, existing.planId, lines)
  const priorLines = await listSubscriptionLines(database, subscriptionId)
  for (const prior of priorLines) {
    await database
      .delete(subscriptionLineTaxes)
      .where(eq(subscriptionLineTaxes.subscriptionLineId, prior.id))
  }
  for (const prior of priorLines) {
    await database.delete(subscriptionLines).where(eq(subscriptionLines.id, prior.id))
  }
  await insertLines(database, subscriptionId, lines)
  await database
    .update(subscriptions)
    .set({ updatedAt: new Date() })
    .where(eq(subscriptions.id, subscriptionId))
  await recordEvent(database, subscriptionId, 'lines_updated', actor)
  return getSubscription(database, subscriptionId)
}
