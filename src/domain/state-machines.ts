import type { SubscriptionStatus } from '../db/schema/subscriptions'

export class InvalidTransitionError extends Error {
  readonly code = 'SUBSCRIPTION_INVALID_TRANSITION'
  readonly status = 409
  readonly from: SubscriptionStatus
  readonly to: SubscriptionStatus

  constructor(from: SubscriptionStatus, to: SubscriptionStatus) {
    super(`Cannot move subscription from ${from} to ${to}`)
    this.name = 'InvalidTransitionError'
    this.from = from
    this.to = to
  }
}

export interface SubscriptionPlanFlags {
  allowEarlyClose: boolean
  allowPause: boolean
  allowRenew: boolean
}

const forwardSteps: Record<SubscriptionStatus, SubscriptionStatus | null> = {
  draft: 'quotation',
  quotation: 'confirmed',
  confirmed: 'active',
  active: 'closed',
  paused: null,
  closed: null,
}

export function canTransitionSubscription(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  flags: SubscriptionPlanFlags,
): boolean {
  if (from === to) return false
  if (forwardSteps[from] === to) {
    if (from === 'active') return true
    return true
  }
  if (to === 'closed' && (from === 'draft' || from === 'quotation' || from === 'confirmed')) {
    return flags.allowEarlyClose
  }
  if (to === 'closed' && from === 'paused') return true
  if (from === 'active' && to === 'paused') return flags.allowPause
  if (from === 'paused' && to === 'active') return flags.allowPause
  if (from === 'closed' && to === 'active') return flags.allowRenew
  return false
}

export function assertSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  flags: SubscriptionPlanFlags,
): void {
  if (!canTransitionSubscription(from, to, flags)) {
    throw new InvalidTransitionError(from, to)
  }
}

export function allowedSubscriptionTargets(
  from: SubscriptionStatus,
  flags: SubscriptionPlanFlags,
): SubscriptionStatus[] {
  const candidates: SubscriptionStatus[] = ['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed']
  return candidates.filter((to) => canTransitionSubscription(from, to, flags))
}
