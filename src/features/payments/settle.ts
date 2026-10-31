import { and, eq, inArray, sql, sum } from 'drizzle-orm'

import type { BillingTransaction } from '../../db/client'
import { invoices } from '../../db/schema/invoices'
import { outboxEvents } from '../../db/schema/outbox'
import { paymentEvents, payments } from '../../db/schema/payments'
import type { PaymentRow } from '../../db/schema/payments'

import { PaymentError } from './errors'

export function requirePayableStatus(status: string): void {
  if (status !== 'confirmed' && status !== 'paid') {
    throw new PaymentError(
      'INVOICE_NOT_PAYABLE',
      'Payments need a confirmed invoice.',
    )
  }
}

// Row locks serialize concurrent verifications: the second transaction waits
// here, then reads the first one's committed sums and statuses.
export async function lockedInvoiceStatus(
  tx: BillingTransaction,
  invoiceId: string,
): Promise<string | undefined> {
  const result = (await tx.execute(
    sql`SELECT status FROM invoices WHERE id = ${invoiceId} FOR UPDATE`,
  )) as unknown as
    Array<{ status: string }> | { rows: Array<{ status: string }> }
  const rows = Array.isArray(result) ? result : result.rows
  return rows[0]?.status
}

export async function lockedPayment(
  tx: BillingTransaction,
  paymentId: string,
): Promise<PaymentRow | undefined> {
  await tx.execute(
    sql`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`,
  )
  return tx.query.payments.findFirst({ where: eq(payments.id, paymentId) })
}

async function applySettlement(
  tx: BillingTransaction,
  invoiceId: string,
  now: Date,
) {
  const totals = await tx
    .select({ paidSum: sum(payments.amountMinor).mapWith(Number) })
    .from(payments)
    .where(
      and(eq(payments.invoiceId, invoiceId), eq(payments.status, 'verified')),
    )
  const paidSum = totals[0]?.paidSum ?? 0
  const invoice = await tx.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  })
  if (!invoice)
    throw new PaymentError('INVOICE_MISSING', 'Invoice is gone.', 404)
  const becamePaid =
    invoice.status === 'confirmed' && paidSum >= invoice.totalMinor
  await tx
    .update(invoices)
    .set({
      amountPaidMinor: paidSum,
      status: becamePaid ? 'paid' : invoice.status,
      paidAt: becamePaid ? now : invoice.paidAt,
      updatedAt: now,
    })
    .where(eq(invoices.id, invoiceId))
  return { becamePaid }
}

// Every approval funnels through here. The invoice lock plus the payable
// re-check make the paid flip and its outbox rows atomic and exactly-once:
// a transaction that waited on the lock sees the committed flip and skips
// its own invoice.paid row.
export async function markVerified(
  tx: BillingTransaction,
  payment: PaymentRow,
  actor: string,
  now: Date,
): Promise<PaymentRow> {
  const lockedStatus = await lockedInvoiceStatus(tx, payment.invoiceId)
  if (!lockedStatus)
    throw new PaymentError('INVOICE_MISSING', 'Invoice is gone.', 404)
  requirePayableStatus(lockedStatus)
  const updated = await tx
    .update(payments)
    .set({
      status: 'verified',
      verifiedBy: actor,
      verifiedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(payments.id, payment.id),
        inArray(payments.status, ['recorded', 'pending_verification']),
      ),
    )
    .returning()
  if (updated.length === 0) {
    const current = await tx.query.payments.findFirst({
      where: eq(payments.id, payment.id),
    })
    throw new PaymentError(
      'ALREADY_DECIDED',
      `Payment is already ${current?.status ?? 'gone'}.`,
      409,
    )
  }
  await tx.insert(paymentEvents).values({
    paymentId: payment.id,
    eventType: 'verified',
    actor,
    payload: { invoiceId: payment.invoiceId, decidedBy: actor },
  })
  const { becamePaid } = await applySettlement(tx, payment.invoiceId, now)
  await tx.insert(outboxEvents).values({
    type: 'payment.verified',
    payload: { paymentId: payment.id, invoiceId: payment.invoiceId },
    nextAttemptAt: now,
  })
  if (becamePaid) {
    const invoice = await tx.query.invoices.findFirst({
      where: eq(invoices.id, payment.invoiceId),
    })
    await tx.insert(outboxEvents).values({
      type: 'invoice.paid',
      payload: {
        invoiceId: payment.invoiceId,
        subscriptionId: invoice?.subscriptionId ?? null,
      },
      nextAttemptAt: now,
    })
  }
  const reloaded = await tx.query.payments.findFirst({
    where: eq(payments.id, payment.id),
  })
  if (!reloaded)
    throw new PaymentError('PAYMENT_FAILED', 'Payment row is gone.')
  return reloaded
}
