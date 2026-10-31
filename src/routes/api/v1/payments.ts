import { eq } from 'drizzle-orm'
import { createFileRoute } from '@tanstack/react-router'

import { invoices } from '#/db/schema/invoices'
import { handleApiRead, handleApiWrite, readJsonBody } from '#/features/api/handler'
import { initiateStoredPayment } from '#/features/payments/initiate'
import { listPayments } from '#/features/payments/queries'
import { claimPaymentSchema, paymentStatusSchema } from '#/features/payments/schema'

export const Route = createFileRoute('/api/v1/payments')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        return handleApiRead(request, 'read', async (database) => {
          const statusParam = url.searchParams.get('status')
          return listPayments(database, {
            invoiceId: url.searchParams.get('invoiceId') ?? undefined,
            status: statusParam ? paymentStatusSchema.parse(statusParam) : undefined,
            page: Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1),
            pageSize: Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 20) || 20)),
          })
        })
      },
      POST: async ({ request }) =>
        handleApiWrite(request, 'write', async (database, actor) => {
          const body = claimPaymentSchema.parse(await readJsonBody(request))
          const target = await database.query.invoices.findFirst({
            where: eq(invoices.id, body.invoiceId),
          })
          if (!target) {
            throw Object.assign(new Error('Invoice is gone'), { status: 404, code: 'INVOICE_MISSING' })
          }
          const row = await initiateStoredPayment(database, {
            invoiceId: target.id,
            customerId: target.customerId,
            method: body.method,
            adapter: 'api-gateway',
            amountMinor: body.amountMinor,
            currency: body.currency,
            paidOn: body.paidOn,
            note: body.note,
            recordedBy: actor.id,
            idempotencyKey: body.idempotencyKey ?? crypto.randomUUID(),
            initialStatus: 'pending_verification',
          })
          return { body: { data: row }, status: 201 }
        }),
    },
  },
})
