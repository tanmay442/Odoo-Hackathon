import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Database } from '../../db/client'
import type { SubscriptionStatus } from '../../db/schema/subscriptions'

import type { DashboardFilterInput } from './schema'

export interface DashboardScope {
  fromStart: Date | null
  toEnd: Date | null
  planId: string | null
  status: SubscriptionStatus | null
}

export type SubscriptionStatusCount = {
  status: SubscriptionStatus
  count: number
}

export type MonthRevenue = {
  month: string
  revenueMinor: number
}

export type MonthFlow = {
  month: string
  opened: number
  closed: number
}

export type AgingBucket = {
  bucket: 'current' | '1-30' | '31-60' | '60+'
  count: number
  amountMinor: number
}

export interface DashboardSummary {
  currency: string
  activeSubscriptions: number
  byStatus: SubscriptionStatusCount[]
  revenueMinor: number
  outstandingMinor: number
  outstandingCount: number
  overdueCount: number
  overdueMinor: number
  revenueByMonth: MonthRevenue[]
  subscriptionFlow: MonthFlow[]
  agingBuckets: AgingBucket[]
}

function startOfDayUtc(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00Z`)
}

function endOfDayUtc(isoDay: string): Date {
  return new Date(`${isoDay}T23:59:59.999Z`)
}

export function resolveScope(filters: DashboardFilterInput): DashboardScope {
  return {
    fromStart: filters.from ? startOfDayUtc(filters.from) : null,
    toEnd: filters.to ? endOfDayUtc(filters.to) : null,
    planId: filters.planId ?? null,
    status: filters.status ?? null,
  }
}

function logQueryTime(label: string, startedAt: number): void {
  if (process.env.NODE_ENV === 'production') return
  console.info(JSON.stringify({ event: 'dashboard.query', label, ms: Date.now() - startedAt }))
}

async function executeRows(database: Database, label: string, query: SQL): Promise<Record<string, unknown>[]> {
  const startedAt = Date.now()
  try {
    const result = (await database.execute(query)) as unknown as
      | Array<Record<string, unknown>>
      | { rows: Array<Record<string, unknown>> }
    return Array.isArray(result) ? result : result.rows
  } finally {
    logQueryTime(label, startedAt)
  }
}

function subscriptionConditions(scope: DashboardScope): SQL[] {
  const conditions: SQL[] = []
  if (scope.planId) conditions.push(sql`s.plan_id = ${scope.planId}`)
  if (scope.status) conditions.push(sql`s.status = ${scope.status}`)
  if (scope.fromStart) conditions.push(sql`s.created_at >= ${scope.fromStart}`)
  if (scope.toEnd) conditions.push(sql`s.created_at <= ${scope.toEnd}`)
  return conditions
}

function invoiceScopeConditions(scope: DashboardScope, dateColumn: SQL): SQL[] {
  const conditions: SQL[] = []
  if (scope.planId) conditions.push(sql`s.plan_id = ${scope.planId}`)
  if (scope.status) conditions.push(sql`s.status = ${scope.status}`)
  if (scope.fromStart) conditions.push(sql`${dateColumn} >= ${scope.fromStart}`)
  if (scope.toEnd) conditions.push(sql`${dateColumn} <= ${scope.toEnd}`)
  return conditions
}

function whereClause(conditions: SQL[]): SQL {
  if (conditions.length === 0) return sql``
  return sql`WHERE ${sql.join(conditions, sql` AND `)}`
}

export async function getSubscriptionStatusCounts(
  database: Database,
  scope: DashboardScope,
): Promise<SubscriptionStatusCount[]> {
  const rows = await executeRows(
    database,
    'subscriptionStatusCounts',
    sql`SELECT s.status AS status, COUNT(*)::int AS count FROM subscriptions s ${whereClause(subscriptionConditions(scope))} GROUP BY s.status ORDER BY s.status`,
  )
  return rows.map((row) => ({
    status: row.status as SubscriptionStatus,
    count: Number(row.count),
  }))
}

export async function getRevenueTotal(
  database: Database,
  scope: DashboardScope,
): Promise<number> {
  // Covering intent: payments(verified_at) carries the range filter, and the
  // invoice/subscription joins reuse their FK + status indexes.
  const conditions: SQL[] = [sql`p.status = 'verified'`]
  if (scope.fromStart) conditions.push(sql`p.verified_at >= ${scope.fromStart}`)
  if (scope.toEnd) conditions.push(sql`p.verified_at <= ${scope.toEnd}`)
  if (scope.planId) conditions.push(sql`s.plan_id = ${scope.planId}`)
  if (scope.status) conditions.push(sql`s.status = ${scope.status}`)
  const planJoin = scope.planId ?? scope.status ? sql`JOIN subscriptions s ON s.id = i.subscription_id` : sql``
  const rows = await executeRows(
    database,
    'revenueTotal',
    sql`SELECT COALESCE(SUM(p.amount_minor), 0)::bigint AS revenue FROM payments p JOIN invoices i ON i.id = p.invoice_id ${planJoin} ${whereClause(conditions)}`,
  )
  return Number(rows[0]?.revenue ?? 0)
}

interface BalanceTotals {
  outstandingMinor: number
  outstandingCount: number
  overdueMinor: number
  overdueCount: number
}

async function getBalanceTotals(
  database: Database,
  scope: DashboardScope,
  now: Date,
): Promise<BalanceTotals> {
  // One scan serves both cards: invoices(status, due_date) covers the
  // status filter and the overdue cutoff, FILTER splits the buckets.
  const balance = sql`i.total_minor - i.amount_paid_minor`
  const conditions: SQL[] = [sql`i.status = 'confirmed'`, sql`${balance} > 0`]
  conditions.push(...invoiceScopeConditions(scope, sql`i.due_date`))
  const planJoin = scope.planId ?? scope.status ? sql`JOIN subscriptions s ON s.id = i.subscription_id` : sql``
  const rows = await executeRows(
    database,
    'balanceTotals',
    sql`SELECT COALESCE(SUM(${balance}), 0)::bigint AS outstanding, COUNT(*)::int AS outstanding_count, COALESCE(SUM(${balance}) FILTER (WHERE i.due_date < ${now}), 0)::bigint AS overdue, COUNT(*) FILTER (WHERE i.due_date < ${now})::int AS overdue_count FROM invoices i ${planJoin} ${whereClause(conditions)}`,
  )
  const row = rows.length > 0 ? rows[0] : undefined
  return {
    outstandingMinor: Number(row?.outstanding ?? 0),
    outstandingCount: Number(row?.outstanding_count ?? 0),
    overdueMinor: Number(row?.overdue ?? 0),
    overdueCount: Number(row?.overdue_count ?? 0),
  }
}

export async function getRevenueByMonth(
  database: Database,
  scope: DashboardScope,
): Promise<MonthRevenue[]> {
  const conditions: SQL[] = [sql`p.status = 'verified'`]
  if (scope.fromStart) conditions.push(sql`p.verified_at >= ${scope.fromStart}`)
  if (scope.toEnd) conditions.push(sql`p.verified_at <= ${scope.toEnd}`)
  if (scope.planId) conditions.push(sql`s.plan_id = ${scope.planId}`)
  if (scope.status) conditions.push(sql`s.status = ${scope.status}`)
  const planJoin = scope.planId ?? scope.status ? sql`JOIN subscriptions s ON s.id = i.subscription_id` : sql``
  const rows = await executeRows(
    database,
    'revenueByMonth',
    sql`SELECT to_char(date_trunc('month', p.verified_at), 'YYYY-MM') AS month, SUM(p.amount_minor)::bigint AS revenue FROM payments p JOIN invoices i ON i.id = p.invoice_id ${planJoin} ${whereClause(conditions)} GROUP BY 1 ORDER BY 1 LIMIT 24`,
  )
  return rows.map((row) => ({
    month: String(row.month),
    revenueMinor: Number(row.revenue),
  }))
}

export async function getSubscriptionFlow(
  database: Database,
  scope: DashboardScope,
): Promise<MonthFlow[]> {
  const openedConditions = subscriptionConditions(scope)
  const opened = await executeRows(
    database,
    'subscriptionsOpenedByMonth',
    sql`SELECT to_char(date_trunc('month', s.created_at), 'YYYY-MM') AS month, COUNT(*)::int AS opened FROM subscriptions s ${whereClause(openedConditions)} GROUP BY 1 ORDER BY 1 LIMIT 24`,
  )
  const closedScope: DashboardScope = { ...scope, status: 'closed' }
  const closedConditions = subscriptionConditions(closedScope)
  const closed = await executeRows(
    database,
    'subscriptionsClosedByMonth',
    sql`SELECT to_char(date_trunc('month', s.updated_at), 'YYYY-MM') AS month, COUNT(*)::int AS closed FROM subscriptions s ${whereClause(closedConditions)} GROUP BY 1 ORDER BY 1 LIMIT 24`,
  )
  const merged = new Map<string, MonthFlow>()
  for (const row of opened) {
    const month = String(row.month)
    merged.set(month, { month, opened: Number(row.opened), closed: 0 })
  }
  for (const row of closed) {
    const month = String(row.month)
    const existing = merged.get(month) ?? { month, opened: 0, closed: 0 }
    existing.closed = Number(row.closed)
    merged.set(month, existing)
  }
  return [...merged.values()].sort((first, second) => (first.month < second.month ? -1 : 1))
}

const bucketOrder: AgingBucket['bucket'][] = ['current', '1-30', '31-60', '60+']

export async function getAgingBuckets(
  database: Database,
  scope: DashboardScope,
  now: Date,
): Promise<AgingBucket[]> {
  const balance = sql`i.total_minor - i.amount_paid_minor`
  const conditions: SQL[] = [sql`i.status = 'confirmed'`, sql`${balance} > 0`]
  conditions.push(...invoiceScopeConditions(scope, sql`i.due_date`))
  const planJoin = scope.planId ?? scope.status ? sql`JOIN subscriptions s ON s.id = i.subscription_id` : sql``
  const rows = await executeRows(
    database,
    'agingBuckets',
    sql`SELECT CASE WHEN i.due_date >= ${now} THEN 'current' WHEN i.due_date >= ${now}::timestamptz - interval '30 days' THEN '1-30' WHEN i.due_date >= ${now}::timestamptz - interval '60 days' THEN '31-60' ELSE '60+' END AS bucket, COUNT(*)::int AS count, COALESCE(SUM(${balance}), 0)::bigint AS amount FROM invoices i ${planJoin} ${whereClause(conditions)} GROUP BY 1`,
  )
  const byBucket = new Map(rows.map((row) => [String(row.bucket), row]))
  return bucketOrder.map((bucket) => ({
    bucket,
    count: Number(byBucket.get(bucket)?.count ?? 0),
    amountMinor: Number(byBucket.get(bucket)?.amount ?? 0),
  }))
}

export async function getDashboardSummary(
  database: Database,
  filters: DashboardFilterInput,
  now: Date = new Date(),
): Promise<DashboardSummary> {
  const scope = resolveScope(filters)
  const [byStatus, revenueMinor, balances, revenueByMonth, subscriptionFlow, agingBuckets] =
    await Promise.all([
      getSubscriptionStatusCounts(database, scope),
      getRevenueTotal(database, scope),
      getBalanceTotals(database, scope, now),
      getRevenueByMonth(database, scope),
      getSubscriptionFlow(database, scope),
      getAgingBuckets(database, scope, now),
    ])
  return {
    currency: 'INR',
    activeSubscriptions: byStatus
      .filter((entry) => entry.status === 'active')
      .reduce((total, entry) => total + entry.count, 0),
    byStatus,
    revenueMinor,
    outstandingMinor: balances.outstandingMinor,
    outstandingCount: balances.outstandingCount,
    overdueCount: balances.overdueCount,
    overdueMinor: balances.overdueMinor,
    revenueByMonth,
    subscriptionFlow,
    agingBuckets,
  }
}
