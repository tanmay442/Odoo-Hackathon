import type { PlanRow } from '../../db/schema/plans'

export class PlanUnavailableError extends Error {
  readonly code = 'PLAN_UNAVAILABLE'

  constructor() {
    super('Plan is outside its availability window')
    this.name = 'PlanUnavailableError'
  }
}

export function isPlanAvailableForNewSubscription(plan: PlanRow, now: Date): boolean {
  if (plan.archivedAt !== null) return false
  if (plan.availableFrom !== null && now < plan.availableFrom) return false
  if (plan.availableTo !== null && now > plan.availableTo) return false
  return true
}

// Phase 03 calls this when building a subscription from a plan.
export function assertPlanAvailableForNewSubscription(plan: PlanRow, now: Date): void {
  if (!isPlanAvailableForNewSubscription(plan, now)) throw new PlanUnavailableError()
}
