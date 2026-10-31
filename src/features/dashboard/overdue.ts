import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Database } from '../../db/client'

import { resolveScope } from './queries'
import type { DashboardOverdueInput } from './schema'

export type OverdueInvoiceEntry = {
  invoiceId: string
  invoiceNumber: string
  customerId: string
  customerName: string
  subscriptionId: string
  planName: string
  dueDate: string
  totalMinor: number
  paidMinor: number
  balanceMinor: number
  daysOverdue: number
}

export interface OverdueInvoicePage {
  rows: OverdueInvoiceEntry[]
  total: number
  page: number
  pageSize: number
}

export async function listOverdueInvoices(
  database: Database,
  filters: DashboardOverdueInput,
  now: Date = new Date(),
): Promise<OverdueInvoicePage> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
  const scope = resolveScope(filters)
  const balance = sql`i.total_minor - i.amount_paid_minor`
  const conditions: SQL[] = [sql`i.status = 'confirmed'`, sql`${balance} > 0`, sql`i.due_date < ${now}`]
  if (scope.planId) conditions.push(sql`s.plan_id = ${scope.planId}`)
  if (scope.status) conditions.push(sql`s.status = ${scope.status}`)
  if (scope.fromStart) conditions.push(sql`i.due_date >= ${scope.fromStart}`)
  if (scope.toEnd) conditions.push(sql`i.due_date <= ${scope.toEnd}`)
  const where = sql`WHERE ${sql.join(conditions, sql` AND `)}`
  const offset = (page - 1) * pageSize
  const countResult = (await database.execute(
    sql`SELECT COUNT(*)::int AS total FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id ${where}`,
  )) as unknown as Array<{ total: number }> | { rows: Array<{ total: number }> }
  const countRows = Array.isArray(countResult) ? countResult : countResult.rows
  const rowResult = (await database.execute(
    sql`SELECT i.id AS invoice_id, i.number AS invoice_number, i.customer_id AS customer_id, c.display_name AS customer_name, i.subscription_id AS subscription_id, pl.name AS plan_name, i.due_date AS due_date, i.total_minor AS total_minor, i.amount_paid_minor AS paid_minor, ${balance} AS balance_minor, FLOOR(EXTRACT(epoch FROM ${now}::timestamptz - i.due_date) / 86400)::int AS days_overdue FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id JOIN customers c ON c.id = i.customer_id JOIN plans pl ON pl.id = s.plan_id ${where} ORDER BY i.due_date ASC LIMIT ${pageSize} OFFSET ${offset}`,
  )) as unknown as Array<Record<string, unknown>> | { rows: Array<Record<string, unknown>> }
  const rowRows = Array.isArray(rowResult) ? rowResult : rowResult.rows
  return {
    rows: rowRows.map((row) => ({
      invoiceId: String(row.invoice_id),
      invoiceNumber: String(row.invoice_number),
      customerId: String(row.customer_id),
      customerName: String(row.customer_name),
      subscriptionId: String(row.subscription_id),
      planName: String(row.plan_name),
      dueDate: new Date(row.due_date as string).toISOString(),
      totalMinor: Number(row.total_minor),
      paidMinor: Number(row.paid_minor),
      balanceMinor: Number(row.balance_minor),
      daysOverdue: Number(row.days_overdue),
    })),
    total: Number(countRows[0]?.total ?? 0),
    page,
    pageSize,
  }
}
