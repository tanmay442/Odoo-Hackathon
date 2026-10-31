import { createFileRoute } from '@tanstack/react-router'

import { handleApiRead } from '#/features/api/handler'
import { getInvoiceDetail } from '#/features/invoices/queries'

export const Route = createFileRoute('/api/v1/invoices/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleApiRead(request, 'read', async (database) => {
          const detail = await getInvoiceDetail(database, params.id)
          if (!detail) {
            throw Object.assign(new Error('Invoice not found'), { status: 404, code: 'NOT_FOUND' })
          }
          return detail
        }),
    },
  },
})
