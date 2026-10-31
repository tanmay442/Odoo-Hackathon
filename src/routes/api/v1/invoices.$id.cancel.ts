import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { handleApiWrite, readJsonBody } from '#/features/api/handler'
import { cancelInvoice } from '#/features/invoices/mutations'

const cancelBody = z.object({ reason: z.string().trim().min(1).max(2000) })

export const Route = createFileRoute('/api/v1/invoices/$id/cancel')({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        handleApiWrite(request, 'write', async (database, actor) => {
          const body = cancelBody.parse(await readJsonBody(request))
          const row = await cancelInvoice(database, actor, params.id, body.reason)
          return { body: { data: row } }
        }),
    },
  },
})
