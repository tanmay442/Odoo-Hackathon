import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { outboxEvents } from '../../db/schema/outbox'
import { subscriptionEvents, subscriptions } from '../../db/schema/subscriptions'
import type {SubscriptionStatus} from '../../db/schema/subscriptions';
import type { UserRow } from '../../db/schema/users'
import { canActAsStaff, ForbiddenError } from '../../lib/auth'
import { addPeriod } from '../../domain/periods'
import { assertSubscriptionTransition } from '../../domain/state-machines'
import { getPlan } from '../plans/queries'

import { getSubscription } from './queries'

const customerAllowedMoves: Array<{ from: SubscriptionStatus; to: SubscriptionStatus }> = [
  { from: 'active', to: 'paused' },
  { from: 'paused', to: 'active' },
  { from: 'active', to: 'closed' },
  { from: 'paused', to: 'closed' },
  { from: 'closed', to: 'active' },
]

export function isCustomerSubscriptionMove(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return customerAllowedMoves.some((move) => move.from === from && move.to === to)
}

export async function transitionSubscription(
  database: Database,
  actor: UserRow,
  subscriptionId: string,
  to: SubscriptionStatus,
) {
  const existing = await getSubscription(database, subscriptionId)
  if (!existing) throw new ForbiddenError()
  const staff = canActAsStaff(actor.role)
  if (!staff) {
    if (actor.customerId !== existing.customerId || !isCustomerSubscriptionMove(existing.status, to)) {
      throw new ForbiddenError()
    }
  }
  const plan = await getPlan(database, existing.planId)
  if (!plan) throw new ForbiddenError()
  assertSubscriptionTransition(existing.status, to, {
    allowEarlyClose: plan.allowEarlyClose,
    allowPause: plan.allowPause,
    allowRenew: plan.allowRenew,
  })
  const now = new Date()
  const patch: Partial<typeof subscriptions.$inferInsert> = { status: to, updatedAt: now }
  if (to === 'active' && existing.status === 'confirmed') {
    const start = existing.currentPeriodStart ?? existing.startDate
    patch.currentPeriodStart = start
    patch.currentPeriodEnd = addPeriod(start, plan.billingInterval, plan.intervalCount)
    patch.nextBillingAt = patch.currentPeriodEnd
    patch.pausedAt = null
  }
  if (to === 'active' && existing.status === 'closed') {
    const start = now
    patch.currentPeriodStart = start
    patch.currentPeriodEnd = addPeriod(start, plan.billingInterval, plan.intervalCount)
    patch.nextBillingAt = patch.currentPeriodEnd
    patch.pausedAt = null
  }
  if (to === 'active' && existing.status === 'paused') {
    patch.pausedAt = null
  }
  if (to === 'paused') {
    patch.pausedAt = now
  }
  const updated = await database.transaction(async (tx) => {
    const rows = await tx
      .update(subscriptions)
      .set(patch)
      .where(eq(subscriptions.id, subscriptionId))
      .returning()
    if (rows.length === 0) throw new ForbiddenError()
    await tx.insert(subscriptionEvents).values({
      subscriptionId,
      actor: `${actor.role}:${actor.id}`,
      eventType: `status:${existing.status}->${to}`,
      payload: null,
    })
    if (to === 'active' && existing.status !== 'active') {
      await tx.insert(outboxEvents).values({
        type: 'subscription.activated',
        payload: { subscriptionId },
        nextAttemptAt: now,
      })
    }
    if (to === 'paused') {
      await tx.insert(outboxEvents).values({
        type: 'subscription.paused',
        payload: { subscriptionId },
        nextAttemptAt: now,
      })
    }
    if (to === 'closed' && existing.status !== 'closed') {
      await tx.insert(outboxEvents).values({
        type: 'subscription.closed',
        payload: { subscriptionId },
        nextAttemptAt: now,
      })
    }
    return rows[0]
  })
  return updated
}
