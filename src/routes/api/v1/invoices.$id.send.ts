import { createFileRoute } from '@tanstack/react-router'

import { handleApiWrite } from '#/features/api/handler'
import { sendInvoice } from '#/features/invoices/mutations'

export const Route = createFileRoute('/api/v1/invoices/$id/send')({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        handleApiWrite(request, 'write', async (database, actor) => {
          const result = await sendInvoice(database, actor, params.id)
          return { body: { data: result } }
        }),
    },
  },
})
