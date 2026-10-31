import { eq } from 'drizzle-orm'

import type { Database } from '../../../db/client'
import { invoices } from '../../../db/schema/invoices'
import { getUserById } from '../../../features/users/queries'
import type {
  PaymentInitiateInput,
  PaymentInitiateResult,
  PaymentPort,
  PaymentVerifyInput,
  PaymentVerifyResult,
  PaymentVerifyOutcome,
} from '../../payment-port'
import {
  decidePayment,
  settleMockGatewayPayment,
} from '../../../features/payments/decide'
import { PaymentError } from '../../../features/payments/errors'
import { initiateStoredPayment } from '../../../features/payments/initiate'

export const mockGatewayAdapterName = 'mock-gateway'

// Simulates the future gateway shape: initiate stays pending until an
// async settle (webhook payload or server fetch result) verifies or fails
// it. The portal Pay button drives this adapter.
export function createMockGatewayAdapter(
  database: Database,
  recorderUserId: string,
): PaymentPort {
  return {
    async initiate(
      input: PaymentInitiateInput,
    ): Promise<PaymentInitiateResult> {
      const invoice = await database.query.invoices.findFirst({
        where: eq(invoices.id, input.invoiceId),
      })
      if (!invoice)
        throw new PaymentError('INVOICE_MISSING', 'Invoice is gone.', 404)
      const payment = await initiateStoredPayment(database, {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        method: 'gateway',
        adapter: mockGatewayAdapterName,
        externalReference: `mock-${input.idempotencyKey}`,
        amountMinor: input.amountMinor,
        currency: input.currency,
        paidOn: new Date().toISOString().slice(0, 10),
        note: '',
        recordedBy: recorderUserId,
        idempotencyKey: input.idempotencyKey,
        initialStatus: 'pending_verification',
      })
      return { paymentId: payment.id, status: payment.status }
    },
    async verify(input: PaymentVerifyInput): Promise<PaymentVerifyResult> {
      const evidence = input.evidence
      if (evidence.kind === 'staff-decision') {
        const staff = await getUserById(database, evidence.actorUserId)
        if (!staff)
          throw new PaymentError('UNKNOWN_ACTOR', 'Acting user is gone.', 404)
        const decided = await decidePayment(database, staff, input.paymentId, {
          approved: evidence.approved,
          reason: evidence.note ?? '',
        })
        const outcome: PaymentVerifyOutcome =
          decided.status === 'verified' ? 'verified' : 'rejected'
        return { outcome, verifiedBy: staff.id }
      }
      if (evidence.kind === 'gateway-fetch') {
        const settled = await settleMockGatewayPayment(
          database,
          input.paymentId,
          evidence.gatewayStatus === 'succeeded' ? 'verified' : 'failed',
          evidence.gatewayReference,
        )
        const outcome: PaymentVerifyOutcome =
          settled.status === 'verified' ? 'verified' : 'failed'
        return { outcome, verifiedBy: settled.verifiedBy ?? 'mock-gateway' }
      }
      const status = (evidence.rawPayload as { status?: unknown }).status
      if (status !== 'succeeded' && status !== 'failed') {
        throw new PaymentError(
          'INVALID_EVIDENCE',
          'Gateway webhook payload needs a status.',
        )
      }
      const settled = await settleMockGatewayPayment(
        database,
        input.paymentId,
        status === 'succeeded' ? 'verified' : 'failed',
        evidence.gatewayReference,
      )
      const outcome: PaymentVerifyOutcome =
        settled.status === 'verified' ? 'verified' : 'failed'
      return { outcome, verifiedBy: settled.verifiedBy ?? 'mock-gateway' }
    },
  }
}
