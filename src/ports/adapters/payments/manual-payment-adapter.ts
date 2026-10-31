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
} from '../../payment-port'
import { decidePayment } from '../../../features/payments/decide'
import { PaymentError } from '../../../features/payments/errors'
import { initiateStoredPayment } from '../../../features/payments/initiate'

export const manualAdapterName = 'manual'

export interface ManualPaymentDetails {
  method: string
  paidOn: string
  note?: string
}

// Bank transfer, cash, UPI, cheque: initiate records the payment, a staff
// decision verifies or rejects it.
export function createManualPaymentAdapter(
  database: Database,
  recorderUserId: string,
  details: ManualPaymentDetails,
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
        method: details.method,
        adapter: manualAdapterName,
        amountMinor: input.amountMinor,
        currency: input.currency,
        paidOn: details.paidOn,
        note: details.note ?? '',
        recordedBy: recorderUserId,
        idempotencyKey: input.idempotencyKey,
        initialStatus: 'recorded',
      })
      return { paymentId: payment.id, status: payment.status }
    },
    async verify(input: PaymentVerifyInput): Promise<PaymentVerifyResult> {
      if (input.evidence.kind !== 'staff-decision') {
        throw new PaymentError(
          'INVALID_EVIDENCE',
          'Manual payments verify by staff decision only.',
        )
      }
      const staff = await getUserById(database, input.evidence.actorUserId)
      if (!staff)
        throw new PaymentError('UNKNOWN_ACTOR', 'Acting user is gone.', 404)
      const decided = await decidePayment(database, staff, input.paymentId, {
        approved: input.evidence.approved,
        reason: input.evidence.note ?? '',
      })
      return {
        outcome: decided.status === 'verified' ? 'verified' : 'rejected',
        verifiedBy: staff.id,
      }
    },
  }
}
