import { and, asc, count, desc, eq  } from 'drizzle-orm'
import type {SQL} from 'drizzle-orm';

import type { Database } from '../../db/client'
import {
  subscriptionEvents,
  subscriptionLines,
  subscriptionLineTaxes,
  subscriptions
  
} from '../../db/schema/subscriptions'
import type {SubscriptionStatus} from '../../db/schema/subscriptions';

export interface SubscriptionListParams {
  status?: SubscriptionStatus
  customerId?: string
  page?: number
  pageSize?: number
}

export async function listSubscriptions(database: Database, params: SubscriptionListParams = {}) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const conditions: SQL[] = []
  if (params.status) conditions.push(eq(subscriptions.status, params.status))
  if (params.customerId) conditions.push(eq(subscriptions.customerId, params.customerId))
  const where = conditions.length > 0 ? and(...conditions) : undefined
  const [rows, totalRows] = await Promise.all([
    database.query.subscriptions.findMany({
      where,
      orderBy: [desc(subscriptions.createdAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    database
      .select({ total: count() })
      .from(subscriptions)
      .where(where)
      .then((result) => result[0]?.total ?? 0),
  ])
  return { rows, total: totalRows, page, pageSize }
}

export function getSubscription(database: Database, subscriptionId: string) {
  return database.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
  })
}

export function listSubscriptionLines(database: Database, subscriptionId: string) {
  return database.query.subscriptionLines.findMany({
    where: eq(subscriptionLines.subscriptionId, subscriptionId),
    orderBy: asc(subscriptionLines.createdAt),
  })
}

export function listSubscriptionLineTaxes(database: Database, subscriptionLineId: string) {
  return database.query.subscriptionLineTaxes.findMany({
    where: eq(subscriptionLineTaxes.subscriptionLineId, subscriptionLineId),
  })
}

export function listSubscriptionEvents(database: Database, subscriptionId: string) {
  return database.query.subscriptionEvents.findMany({
    where: eq(subscriptionEvents.subscriptionId, subscriptionId),
    orderBy: asc(subscriptionEvents.createdAt),
  })
}

export async function getSubscriptionDetail(database: Database, subscriptionId: string) {
  const subscription = await getSubscription(database, subscriptionId)
  if (!subscription) return null
  const lines = await listSubscriptionLines(database, subscriptionId)
  const linesWithTaxes = await Promise.all(
    lines.map(async (line) => ({
      ...line,
      taxIds: (await listSubscriptionLineTaxes(database, line.id)).map((row) => row.taxId),
    })),
  )
  const events = await listSubscriptionEvents(database, subscriptionId)
  return { ...subscription, lines: linesWithTaxes, events }
}

export function listCustomerSubscriptions(database: Database, customerId: string) {
  return database.query.subscriptions.findMany({
    where: eq(subscriptions.customerId, customerId),
    orderBy: desc(subscriptions.createdAt),
  })
}
