import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { handleApiWrite, readJsonBody } from '#/features/api/handler'
import { decidePayment } from '#/features/payments/decide'
import { notifyPaymentOutcome } from '#/features/payments/notify'

const verifyBody = z.object({
  approved: z.boolean(),
  reason: z.string().trim().max(2000).default(''),
})

export const Route = createFileRoute('/api/v1/payments/$id/verify')({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        handleApiWrite(request, 'payments:verify', async (database, actor) => {
          const body = verifyBody.parse(await readJsonBody(request))
          const decided = await decidePayment(database, actor, params.id, {
            approved: body.approved,
            reason: body.reason,
          })
          try {
            await notifyPaymentOutcome(database, decided, body.approved ? null : body.reason)
          } catch (error) {
            console.error(JSON.stringify({ event: 'email.notify_failed', paymentId: decided.id, error: String(error) }))
          }
          return { body: { data: decided } }
        }),
    },
  },
})
