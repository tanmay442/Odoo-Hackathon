import { createFileRoute } from '@tanstack/react-router'

import { handleApiWrite } from '#/features/api/handler'
import { confirmInvoice } from '#/features/invoices/mutations'

export const Route = createFileRoute('/api/v1/invoices/$id/confirm')({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        handleApiWrite(request, 'write', async (database, actor) => {
          const row = await confirmInvoice(database, actor, params.id)
          return { body: { data: row } }
        }),
    },
  },
})
