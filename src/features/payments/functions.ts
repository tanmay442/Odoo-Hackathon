import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDatabase } from '../../db/client'
import { currentClerkUserId, guardServerFn } from '../../lib/auth'
import {
  requireCustomerOwnerRecord,
  requireStaffRecord,
  resolveUserRecord,
} from '../users/guards'
import { getInvoiceDetail } from '../invoices/queries'

import { decidePayment } from './decide'
import { PaymentError } from './errors'
import { recordStaffPayment, submitPaymentClaim } from './initiate'
import {
  getPayment,
  listInvoicePaymentEvents,
  listInvoicePayments,
  listVerificationQueue,
} from './queries'
import {
  claimPaymentSchema,
  decidePaymentSchema,
  paymentQueueSchema,
  recordPaymentSchema,
} from './schema'

function paymentFailure(error: unknown) {
  if (error instanceof PaymentError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    )
  }
  throw error
}

export const paymentRecordFn = createServerFn({ method: 'POST' })
  .validator(recordPaymentSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      try {
        const database = getDatabase()
        const staff = await requireStaffRecord(
          database,
          await currentClerkUserId(),
        )
        return await recordStaffPayment(database, staff, data)
      } catch (error) {
        return paymentFailure(error)
      }
    }),
  )

export const paymentClaimFn = createServerFn({ method: 'POST' })
  .validator(claimPaymentSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      try {
        const database = getDatabase()
        const actor = await resolveUserRecord(
          database,
          await currentClerkUserId(),
        )
        return await submitPaymentClaim(database, actor, data)
      } catch (error) {
        return paymentFailure(error)
      }
    }),
  )

export const paymentDecideFn = createServerFn({ method: 'POST' })
  .validator(decidePaymentSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      try {
        const database = getDatabase()
        const staff = await requireStaffRecord(
          database,
          await currentClerkUserId(),
        )
        return await decidePayment(database, staff, data.paymentId, {
          approved: data.approved,
          reason: data.reason,
        })
      } catch (error) {
        return paymentFailure(error)
      }
    }),
  )

export const paymentQueueFn = createServerFn({ method: 'GET' })
  .validator(paymentQueueSchema.optional())
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireStaffRecord(database, await currentClerkUserId())
      return listVerificationQueue(database, data ?? {})
    }),
  )

export const invoicePaymentsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ invoiceId: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const clerkUserId = await currentClerkUserId()
      const detail = await getInvoiceDetail(database, data.invoiceId)
      if (!detail) return null
      await requireCustomerOwnerRecord(database, clerkUserId, detail.customerId)
      const [paymentRows, eventRows] = await Promise.all([
        listInvoicePayments(database, data.invoiceId),
        listInvoicePaymentEvents(database, data.invoiceId),
      ])
      return { payments: paymentRows, events: eventRows, invoice: detail }
    }),
  )

export const paymentEventsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ paymentId: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const clerkUserId = await currentClerkUserId()
      const payment = await getPayment(database, data.paymentId)
      if (!payment) return null
      await requireCustomerOwnerRecord(
        database,
        clerkUserId,
        payment.customerId,
      )
      return listInvoicePaymentEvents(database, payment.invoiceId)
    }),
  )
