import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { plans } from '../../db/schema/plans'
import type { UserRow } from '../../db/schema/users'
import { assertAdminRole, ForbiddenError } from '../../lib/auth'

import { getPlan, hasNonClosedSubscriptions } from './queries'
import type { PlanInput, UpdatePlanInput } from './schema'

function availabilityTimestamp(isoDate: string | null | undefined): Date | null {
  if (!isoDate) return null
  return new Date(`${isoDate}T00:00:00Z`)
}

export async function createPlan(database: Database, actor: UserRow, input: PlanInput) {
  assertAdminRole(actor.role)
  const inserted = await database
    .insert(plans)
    .values({
      name: input.name,
      productId: input.productId ?? null,
      priceMinor: input.priceMinor,
      currency: input.currency ?? 'INR',
      billingInterval: input.billingInterval,
      intervalCount: input.intervalCount,
      minQuantity: input.minQuantity,
      availableFrom: availabilityTimestamp(input.availableFrom),
      availableTo: availabilityTimestamp(input.availableTo),
      autoCloseAtEnd: input.autoCloseAtEnd,
      allowEarlyClose: input.allowEarlyClose,
      allowPause: input.allowPause,
      allowRenew: input.allowRenew,
    })
    .returning()
  if (inserted.length === 0) throw new Error('Plan insert lost its row')
  return inserted[0]
}

export async function updatePlan(database: Database, actor: UserRow, input: UpdatePlanInput) {
  assertAdminRole(actor.role)
  const existing = await getPlan(database, input.id)
  if (!existing) throw new ForbiddenError()
  const priceChanged = existing.priceMinor !== input.priceMinor
  const stampPriceChange =
    priceChanged && (await hasNonClosedSubscriptions(database, input.id))
  const updated = await database
    .update(plans)
    .set({
      name: input.name,
      productId: input.productId ?? null,
      priceMinor: input.priceMinor,
      currency: input.currency ?? 'INR',
      billingInterval: input.billingInterval,
      intervalCount: input.intervalCount,
      minQuantity: input.minQuantity,
      availableFrom: availabilityTimestamp(input.availableFrom),
      availableTo: availabilityTimestamp(input.availableTo),
      autoCloseAtEnd: input.autoCloseAtEnd,
      allowEarlyClose: input.allowEarlyClose,
      allowPause: input.allowPause,
      allowRenew: input.allowRenew,
      priceChangedAt: stampPriceChange ? new Date() : existing.priceChangedAt,
      updatedAt: new Date(),
    })
    .where(eq(plans.id, input.id))
    .returning()
  if (updated.length === 0) throw new ForbiddenError()
  return updated[0]
}

export interface DeletePlanResult {
  archived: boolean
}

// A plan with live subscriptions stays queryable but leaves the editable
// set: archive instead of delete when referenced.
export async function deletePlan(
  database: Database,
  actor: UserRow,
  planId: string,
): Promise<DeletePlanResult> {
  assertAdminRole(actor.role)
  const existing = await getPlan(database, planId)
  if (!existing) throw new ForbiddenError()
  if (await hasNonClosedSubscriptions(database, planId)) {
    await database
      .update(plans)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(plans.id, planId))
    return { archived: true }
  }
  await database.delete(plans).where(eq(plans.id, planId))
  return { archived: false }
}

export async function restorePlan(database: Database, actor: UserRow, planId: string) {
  assertAdminRole(actor.role)
  const restored = await database
    .update(plans)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(plans.id, planId))
    .returning()
  if (restored.length === 0) throw new ForbiddenError()
  return restored[0]
}
