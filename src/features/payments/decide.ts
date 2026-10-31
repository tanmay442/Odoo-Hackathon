import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { paymentEvents, payments } from '../../db/schema/payments'
import type { PaymentRow } from '../../db/schema/payments'
import type { UserRow } from '../../db/schema/users'
import { canActAsStaff, ForbiddenError } from '../../lib/auth'

import { PaymentError } from './errors'
import { lockedPayment, markVerified } from './settle'
import type { DecidePaymentInput } from './schema'

function requireDecidable(payment: PaymentRow): void {
  if (
    payment.status !== 'pending_verification' &&
    payment.status !== 'recorded'
  ) {
    throw new PaymentError(
      'ALREADY_DECIDED',
      `Payment is already ${payment.status}.`,
      409,
    )
  }
}

// Staff verification queue decision. Rejection needs a reason; approval
// settles the invoice inside this transaction, so the flip to paid is
// atomic with the verification.
export async function decidePayment(
  database: Database,
  staff: UserRow,
  paymentId: string,
  options: Omit<DecidePaymentInput, 'paymentId'>,
) {
  if (!canActAsStaff(staff.role)) throw new ForbiddenError()
  if (!options.approved && options.reason.trim() === '') {
    throw new PaymentError(
      'REASON_REQUIRED',
      'A reason is required to reject a payment.',
    )
  }
  const now = new Date()
  return database.transaction(async (tx) => {
    const payment = await lockedPayment(tx, paymentId)
    if (!payment) throw new ForbiddenError()
    requireDecidable(payment)
    if (options.approved) return markVerified(tx, payment, staff.id, now)
    const updated = await tx
      .update(payments)
      .set({
        status: 'rejected',
        verifiedBy: staff.id,
        verifiedAt: now,
        updatedAt: now,
      })
      .where(eq(payments.id, payment.id))
      .returning()
    if (updated.length === 0)
      throw new PaymentError('PAYMENT_FAILED', 'Payment update lost its row.')
    await tx.insert(paymentEvents).values({
      paymentId: payment.id,
      eventType: 'rejected',
      actor: staff.id,
      payload: {
        invoiceId: payment.invoiceId,
        decidedBy: staff.id,
        reason: options.reason.trim(),
      },
    })
    const reloaded = await tx.query.payments.findFirst({
      where: eq(payments.id, payment.id),
    })
    if (!reloaded)
      throw new PaymentError('PAYMENT_FAILED', 'Payment row is gone.')
    return reloaded
  })
}

// Async leg of the mock gateway: settles a pending gateway payment after
// the simulated provider answers. Failed settles stay visible as failed.
export async function settleMockGatewayPayment(
  database: Database,
  paymentId: string,
  outcome: 'verified' | 'failed',
  reference?: string,
) {
  const now = new Date()
  const actor = `mock-gateway:${reference ?? paymentId}`
  return database.transaction(async (tx) => {
    const payment = await lockedPayment(tx, paymentId)
    if (!payment) throw new ForbiddenError()
    if (payment.adapter !== 'mock-gateway') {
      throw new PaymentError(
        'WRONG_ADAPTER',
        'Only mock-gateway payments settle here.',
      )
    }
    requireDecidable(payment)
    if (outcome === 'verified') return markVerified(tx, payment, actor, now)
    const updated = await tx
      .update(payments)
      .set({
        status: 'failed',
        verifiedBy: actor,
        verifiedAt: now,
        updatedAt: now,
      })
      .where(eq(payments.id, payment.id))
      .returning()
    if (updated.length === 0)
      throw new PaymentError('PAYMENT_FAILED', 'Payment update lost its row.')
    await tx.insert(paymentEvents).values({
      paymentId: payment.id,
      eventType: 'failed',
      actor,
      payload: {
        invoiceId: payment.invoiceId,
        reference: reference ?? null,
        error: 'gateway declined',
      },
    })
    const reloaded = await tx.query.payments.findFirst({
      where: eq(payments.id, payment.id),
    })
    if (!reloaded)
      throw new PaymentError('PAYMENT_FAILED', 'Payment row is gone.')
    return reloaded
  })
}
