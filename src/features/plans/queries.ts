import { and, asc, eq, ne } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { plans } from '../../db/schema/plans'
import { subscriptions } from '../../db/schema/subscriptions'

export function listPlans(database: Database) {
  return database.query.plans.findMany({ orderBy: asc(plans.createdAt) })
}

export function getPlan(database: Database, planId: string) {
  return database.query.plans.findFirst({ where: eq(plans.id, planId) })
}

export async function hasNonClosedSubscriptions(
  database: Database,
  planId: string,
): Promise<boolean> {
  const row = await database.query.subscriptions.findFirst({
    columns: { id: true },
    where: and(eq(subscriptions.planId, planId), ne(subscriptions.status, 'closed')),
  })
  return row !== undefined
}
