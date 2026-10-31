import { eq } from 'drizzle-orm'

import type { BillingTransaction, Database } from '../../db/client'
import { invoices } from '../../db/schema/invoices'
import { paymentEvents, payments } from '../../db/schema/payments'
import type { PaymentRow } from '../../db/schema/payments'
import type { UserRow } from '../../db/schema/users'
import { canActAsStaff, ForbiddenError } from '../../lib/auth'

import { PaymentError } from './errors'
import {
  lockedInvoiceStatus,
  markVerified,
  requirePayableStatus,
} from './settle'
import type { ClaimPaymentInput, RecordPaymentInput } from './schema'

function isIdempotencyViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  if (code === '23505') return true
  const message = (error as { message?: unknown }).message
  return (
    typeof message === 'string' &&
    message.includes('payments_idempotency_key_unique')
  )
}

export interface InitiateStoredPaymentInput {
  invoiceId: string
  customerId: string
  method: string
  adapter: string
  externalReference?: string | null
  amountMinor: number
  currency: string
  paidOn: string
  note: string
  recordedBy: string
  idempotencyKey: string
  initialStatus: 'recorded' | 'pending_verification'
}

async function insertInitiatedPayment(
  tx: BillingTransaction,
  input: InitiateStoredPaymentInput,
): Promise<PaymentRow> {
  const inserted = await tx
    .insert(payments)
    .values({
      invoiceId: input.invoiceId,
      customerId: input.customerId,
      method: input.method,
      adapter: input.adapter,
      externalReference: input.externalReference ?? null,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: input.initialStatus,
      recordedBy: input.recordedBy,
      paidOn: input.paidOn,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
    })
    .returning()
  if (inserted.length === 0)
    throw new PaymentError('PAYMENT_FAILED', 'Payment insert lost its row.')
  const created = inserted[0]
  await tx.insert(paymentEvents).values({
    paymentId: created.id,
    eventType: 'initiated',
    actor: input.recordedBy,
    payload: {
      adapter: input.adapter,
      method: input.method,
      amountMinor: input.amountMinor,
      invoiceId: input.invoiceId,
    },
  })
  return created
}

async function findByIdempotencyKey(tx: BillingTransaction, key: string) {
  return tx.query.payments.findFirst({
    where: eq(payments.idempotencyKey, key),
  })
}

// Caller-supplied idempotency key: a replayed initiate returns the original
// payment row without inserting a duplicate or appending another event.
export async function initiateStoredPayment(
  database: Database,
  input: InitiateStoredPaymentInput,
): Promise<PaymentRow> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 1) {
    throw new PaymentError('INVALID_AMOUNT', 'Amount must be at least ₹0.01.')
  }
  return database.transaction(async (tx) => {
    const lockedStatus = await lockedInvoiceStatus(tx, input.invoiceId)
    if (!lockedStatus)
      throw new PaymentError('INVOICE_MISSING', 'Invoice is gone.', 404)
    const replayed = await findByIdempotencyKey(tx, input.idempotencyKey)
    if (replayed) return replayed
    try {
      return await insertInitiatedPayment(tx, input)
    } catch (error) {
      if (!isIdempotencyViolation(error)) throw error
      const winner = await findByIdempotencyKey(tx, input.idempotencyKey)
      if (!winner) throw error
      return winner
    }
  })
}

// Staff entry of a bank credit is trusted: record and verify atomically, so
// the invoice flips to paid inside the same transaction when covered.
export async function recordStaffPayment(
  database: Database,
  staff: UserRow,
  input: RecordPaymentInput,
) {
  if (!canActAsStaff(staff.role)) throw new ForbiddenError()
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 1) {
    throw new PaymentError('INVALID_AMOUNT', 'Amount must be at least ₹0.01.')
  }
  const invoice = await database.query.invoices.findFirst({
    where: eq(invoices.id, input.invoiceId),
  })
  if (!invoice) throw new ForbiddenError()
  requirePayableStatus(invoice.status)
  const now = new Date()
  const key = input.idempotencyKey ?? crypto.randomUUID()
  return database.transaction(async (tx) => {
    const lockedStatus = await lockedInvoiceStatus(tx, invoice.id)
    if (!lockedStatus)
      throw new PaymentError('INVOICE_MISSING', 'Invoice is gone.', 404)
    requirePayableStatus(lockedStatus)
    let payment = await findByIdempotencyKey(tx, key)
    if (!payment) {
      try {
        payment = await insertInitiatedPayment(tx, {
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          method: input.method,
          adapter: 'manual',
          amountMinor: input.amountMinor,
          currency: input.currency,
          paidOn: input.paidOn,
          note: input.note,
          recordedBy: staff.id,
          idempotencyKey: key,
          initialStatus: 'recorded',
        })
      } catch (error) {
        if (!isIdempotencyViolation(error)) throw error
        payment = await findByIdempotencyKey(tx, key)
        if (!payment) throw error
      }
    }
    if (payment.status !== 'recorded') return payment
    return markVerified(tx, payment, staff.id, now)
  })
}

// A customer claim waits for staff: it touches no invoice totals and flips
// no status until a staff member verifies it.
export async function submitPaymentClaim(
  database: Database,
  actor: UserRow,
  input: ClaimPaymentInput,
) {
  const invoice = await database.query.invoices.findFirst({
    where: eq(invoices.id, input.invoiceId),
  })
  if (!invoice) throw new ForbiddenError()
  const ownsInvoice =
    actor.customerId !== null && actor.customerId === invoice.customerId
  if (!canActAsStaff(actor.role) && !ownsInvoice) throw new ForbiddenError()
  requirePayableStatus(invoice.status)
  return initiateStoredPayment(database, {
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    method: input.method,
    adapter: canActAsStaff(actor.role) ? 'manual' : 'portal-claim',
    amountMinor: input.amountMinor,
    currency: input.currency,
    paidOn: input.paidOn,
    note: input.note,
    recordedBy: actor.id,
    idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    initialStatus: 'pending_verification',
  })
}
