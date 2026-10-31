import { createFileRoute } from '@tanstack/react-router'

import { handleApiRead } from '#/features/api/handler'
import { getSubscriptionDetail } from '#/features/subscriptions/queries'

export const Route = createFileRoute('/api/v1/subscriptions/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleApiRead(request, 'read', async (database) => {
          const detail = await getSubscriptionDetail(database, params.id)
          if (!detail) {
            throw Object.assign(new Error('Subscription not found'), { status: 404, code: 'NOT_FOUND' })
          }
          return detail
        }),
    },
  },
})
