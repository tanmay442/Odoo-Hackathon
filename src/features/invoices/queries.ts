import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Database } from '../../db/client'
import {
  invoiceDiscounts,
  invoiceLineTaxes,
  invoiceLines,
  invoiceTaxes,
  invoices,
} from '../../db/schema/invoices'
import type { InvoiceStatus } from '../../db/schema/invoices'
import { discounts } from '../../db/schema/discounts'
import { subscriptions } from '../../db/schema/subscriptions'

import type { InvoiceListInput } from './schema'

export interface InvoiceListParams extends InvoiceListInput {}

function startOfDayUtc(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00Z`)
}

function endOfDayUtc(isoDay: string): Date {
  return new Date(`${isoDay}T23:59:59.999Z`)
}

export function isInvoiceOverdue(row: { status: InvoiceStatus; dueDate: Date; amountPaidMinor: number; totalMinor: number }, today: Date = new Date()): boolean {
  return (
    row.status === 'confirmed' &&
    row.dueDate < today &&
    row.amountPaidMinor < row.totalMinor
  )
}

export async function listInvoices(database: Database, params: InvoiceListParams = {}) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const conditions: SQL[] = []
  if (params.status) conditions.push(eq(invoices.status, params.status))
  if (params.customerId) conditions.push(eq(invoices.customerId, params.customerId))
  if (params.from) conditions.push(gte(invoices.dueDate, startOfDayUtc(params.from)))
  if (params.to) conditions.push(lte(invoices.dueDate, endOfDayUtc(params.to)))
  if (params.overdueOnly) {
    conditions.push(eq(invoices.status, 'confirmed'))
    conditions.push(lte(invoices.dueDate, new Date()))
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined
  const rows = await database.query.invoices.findMany({
    where,
    orderBy: [asc(invoices.dueDate)],
  })
  const filtered = params.overdueOnly
    ? rows.filter((row) => row.amountPaidMinor < row.totalMinor)
    : rows
  const sorted = [...filtered].sort((first, second) => {
    const firstOverdue = isInvoiceOverdue(first) ? 0 : 1
    const secondOverdue = isInvoiceOverdue(second) ? 0 : 1
    if (firstOverdue !== secondOverdue) return firstOverdue - secondOverdue
    return first.dueDate.getTime() - second.dueDate.getTime()
  })
  return {
    rows: sorted.slice((page - 1) * pageSize, page * pageSize),
    total: sorted.length,
    page,
    pageSize,
  }
}

export function getInvoice(database: Database, invoiceId: string) {
  return database.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) })
}

export function listInvoiceLines(database: Database, invoiceId: string) {
  return database.query.invoiceLines.findMany({
    where: eq(invoiceLines.invoiceId, invoiceId),
    orderBy: asc(invoiceLines.createdAt),
  })
}

export function listInvoiceLineTaxes(database: Database, invoiceLineId: string) {
  return database.query.invoiceLineTaxes.findMany({
    where: eq(invoiceLineTaxes.invoiceLineId, invoiceLineId),
  })
}

export function listInvoiceTaxes(database: Database, invoiceId: string) {
  return database.query.invoiceTaxes.findMany({ where: eq(invoiceTaxes.invoiceId, invoiceId) })
}

export function listInvoiceDiscounts(database: Database, invoiceId: string) {
  return database.query.invoiceDiscounts.findMany({
    where: eq(invoiceDiscounts.invoiceId, invoiceId),
  })
}

export async function getInvoiceDetail(database: Database, invoiceId: string) {
  const invoice = await getInvoice(database, invoiceId)
  if (!invoice) return null
  const lines = await listInvoiceLines(database, invoiceId)
  const linesWithTaxes = await Promise.all(
    lines.map(async (line) => ({
      ...line,
      taxes: await listInvoiceLineTaxes(database, line.id),
    })),
  )
  const [taxes, discountLinks] = await Promise.all([
    listInvoiceTaxes(database, invoiceId),
    listInvoiceDiscounts(database, invoiceId),
  ])
  const discountRows =
    discountLinks.length === 0
      ? []
      : await database.query.discounts.findMany({
          where: inArray(
            discounts.id,
            discountLinks.map((link) => link.discountId),
          ),
        })
  const discountNames = new Map(discountRows.map((row) => [row.id, row.name]))
  return {
    ...invoice,
    lines: linesWithTaxes,
    taxes,
    discounts: discountLinks.map((link) => ({
      ...link,
      name: discountNames.get(link.discountId) ?? link.discountId,
    })),
    overdue: isInvoiceOverdue(invoice),
  }
}

export function listCustomerInvoices(database: Database, customerId: string) {
  return database.query.invoices.findMany({
    where: eq(invoices.customerId, customerId),
    orderBy: desc(invoices.createdAt),
  })
}

export function listDueSubscriptions(database: Database, now: Date = new Date(), limit = 100) {
  return database.query.subscriptions.findMany({
    where: and(eq(subscriptions.status, 'active'), lte(subscriptions.nextBillingAt, now)),
    orderBy: asc(subscriptions.nextBillingAt),
    limit,
  })
}
