import { asc, eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import type { InvoiceRow } from '../../db/schema/invoices'
import { invoices } from '../../db/schema/invoices'
import { customers } from '../../db/schema/customers'
import { paymentEvents, payments } from '../../db/schema/payments'

import type { PaymentQueueInput } from './schema'

export function getPayment(database: Database, paymentId: string) {
  return database.query.payments.findFirst({
    where: eq(payments.id, paymentId),
  })
}

export function listInvoicePayments(database: Database, invoiceId: string) {
  return database.query.payments.findMany({
    where: eq(payments.invoiceId, invoiceId),
    orderBy: asc(payments.createdAt),
  })
}

export function listPaymentEvents(database: Database, paymentId: string) {
  return database.query.paymentEvents.findMany({
    where: eq(paymentEvents.paymentId, paymentId),
    orderBy: asc(paymentEvents.createdAt),
  })
}

export async function listInvoicePaymentEvents(
  database: Database,
  invoiceId: string,
) {
  const rows = await listInvoicePayments(database, invoiceId)
  if (rows.length === 0) return []
  const events = await Promise.all(
    rows.map((row) => listPaymentEvents(database, row.id)),
  )
  return events
    .flat()
    .sort(
      (first, second) => first.createdAt.getTime() - second.createdAt.getTime(),
    )
}

export type VerificationQueueEntry = {
  paymentId: string
  method: string
  adapter: string
  amountMinor: number
  currency: string
  paidOn: string
  note: string
  recordedBy: string
  claimedAt: Date
  invoiceId: string
  invoiceNumber: string
  invoiceTotalMinor: number
  invoicePaidMinor: number
  customerId: string
  customerName: string
}

export async function listVerificationQueue(
  database: Database,
  params: PaymentQueueInput = {},
) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const pending = await database.query.payments.findMany({
    where: eq(payments.status, 'pending_verification'),
    orderBy: asc(payments.createdAt),
  })
  const entries: VerificationQueueEntry[] = []
  for (const payment of pending) {
    const [invoice, customer] = await Promise.all([
      database.query.invoices.findFirst({
        where: eq(invoices.id, payment.invoiceId),
      }),
      database.query.customers.findFirst({
        where: eq(customers.id, payment.customerId),
      }),
    ])
    if (!invoice) continue
    entries.push({
      paymentId: payment.id,
      method: payment.method,
      adapter: payment.adapter,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      paidOn: payment.paidOn,
      note: payment.note,
      recordedBy: payment.recordedBy,
      claimedAt: payment.createdAt,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      invoiceTotalMinor: invoice.totalMinor,
      invoicePaidMinor: invoice.amountPaidMinor,
      customerId: payment.customerId,
      customerName: customer?.displayName ?? payment.customerId,
    })
  }
  return {
    rows: entries.slice((page - 1) * pageSize, page * pageSize),
    total: entries.length,
    page,
    pageSize,
  }
}

export function invoiceBalance(
  invoice: Pick<InvoiceRow, 'totalMinor' | 'amountPaidMinor'>,
): {
  balanceMinor: number
  overpaidMinor: number
} {
  const remaining = invoice.totalMinor - invoice.amountPaidMinor
  return {
    balanceMinor: Math.max(0, remaining),
    overpaidMinor: Math.max(0, -remaining),
  }
}
