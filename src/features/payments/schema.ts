import { z } from 'zod'

import type { PaymentStatus } from '../../db/schema/payments'

export const paymentStatuses: PaymentStatus[] = [
  'recorded',
  'pending_verification',
  'verified',
  'rejected',
  'failed',
  'refunded',
]

export const paymentMethods = [
  'bank_transfer',
  'cash',
  'upi',
  'cheque',
  'card',
  'gateway',
  'other',
] as const

export type PaymentMethod = (typeof paymentMethods)[number]

export const paymentMethodSchema = z.enum(paymentMethods)

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

const paymentAmountSchema = z.object({
  invoiceId: z.uuid(),
  method: paymentMethodSchema,
  amountMinor: z.number().int().min(1, 'Amount must be at least ₹0.01'),
  currency: z.string().min(1).max(8).default('INR'),
  paidOn: isoDay,
  note: z.string().max(2000).default(''),
  idempotencyKey: z.uuid().optional(),
})

export const recordPaymentSchema = paymentAmountSchema

export const claimPaymentSchema = paymentAmountSchema

export const decidePaymentSchema = z
  .object({
    paymentId: z.uuid(),
    approved: z.boolean(),
    reason: z.string().trim().max(2000).default(''),
  })
  .refine((value) => value.approved || value.reason.length > 0, {
    message: 'A reason is required to reject a payment.',
    path: ['reason'],
  })

export const paymentQueueSchema = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

export type RecordPaymentInput = z.output<typeof recordPaymentSchema>
export type ClaimPaymentInput = z.output<typeof claimPaymentSchema>
export type DecidePaymentInput = z.output<typeof decidePaymentSchema>
export type PaymentQueueInput = z.output<typeof paymentQueueSchema>
