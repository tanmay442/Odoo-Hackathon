import { createFileRoute } from '@tanstack/react-router'

import { handleApiRead } from '#/features/api/handler'
import { getPayment } from '#/features/payments/queries'

export const Route = createFileRoute('/api/v1/payments/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleApiRead(request, 'read', async (database) => {
          const row = await getPayment(database, params.id)
          if (!row) {
            throw Object.assign(new Error('Payment not found'), { status: 404, code: 'NOT_FOUND' })
          }
          return row
        }),
    },
  },
})
