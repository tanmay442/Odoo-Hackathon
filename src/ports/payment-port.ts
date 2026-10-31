import type { PaymentStatus } from '../db/schema/payments'

export type { PaymentStatus }

export interface PaymentInitiateInput {
  invoiceId: string
  amountMinor: number
  currency: string
  idempotencyKey: string
}

export interface PaymentInitiateResult {
  paymentId: string
  status: PaymentStatus
}

// Verification principle: money is verified only by a signed gateway
// payload, a server-to-gateway fetch, or an accountable staff decision.
// The browser never verifies a payment.
export type PaymentEvidence =
  | {
      kind: 'staff-decision'
      actorUserId: string
      approved: boolean
      note?: string
    }
  | {
      kind: 'gateway-webhook'
      rawPayload: Record<string, unknown>
      gatewayReference?: string
    }
  | {
      kind: 'gateway-fetch'
      gatewayStatus: 'succeeded' | 'failed'
      gatewayReference?: string
    }

export interface PaymentVerifyInput {
  paymentId: string
  evidence: PaymentEvidence
}

export type PaymentVerifyOutcome = 'verified' | 'rejected' | 'failed'

export interface PaymentVerifyResult {
  outcome: PaymentVerifyOutcome
  verifiedBy: string
}

export interface PaymentRefundInput {
  paymentId: string
  amountMinor: number
}

export interface PaymentRefundResult {
  refundId: string
}

// The only payment contract billing code knows. Gateway adapters plug in
// here later with zero billing-code changes.
export interface PaymentPort {
  initiate: (input: PaymentInitiateInput) => Promise<PaymentInitiateResult>
  verify: (input: PaymentVerifyInput) => Promise<PaymentVerifyResult>
  refund?: (input: PaymentRefundInput) => Promise<PaymentRefundResult>
}
