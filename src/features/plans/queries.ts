import { asc, eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { plans } from '../../db/schema/plans'

export function listPlans(database: Database) {
  return database.query.plans.findMany({ orderBy: asc(plans.createdAt) })
}

export function getPlan(database: Database, planId: string) {
  return database.query.plans.findFirst({ where: eq(plans.id, planId) })
}

// Phase 03 owns the subscriptions table; this stub keeps the plan price
// rule and the delete guard compiling until the real check lands.
export async function hasNonClosedSubscriptions(
  _database: Database,
  _planId: string,
): Promise<boolean> {
  return false
}
