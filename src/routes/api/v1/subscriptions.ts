import { createFileRoute } from '@tanstack/react-router'

import { handleApiRead, handleApiWrite, readJsonBody } from '#/features/api/handler'
import { createSubscription } from '#/features/subscriptions/mutations'
import { getSubscriptionDetail, listSubscriptions } from '#/features/subscriptions/queries'
import { subscriptionCreateSchema, subscriptionStatusSchema } from '#/features/subscriptions/schema'

export const Route = createFileRoute('/api/v1/subscriptions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        return handleApiRead(request, 'read', async (database) => {
          const statusParam = url.searchParams.get('status')
          const customerId = url.searchParams.get('customerId')
          return listSubscriptions(database, {
            status: statusParam ? subscriptionStatusSchema.parse(statusParam) : undefined,
            customerId: customerId ?? undefined,
            page: Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1),
            pageSize: Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 20) || 20)),
          })
        })
      },
      POST: async ({ request }) =>
        handleApiWrite(request, 'write', async (database, actor) => {
          const body = subscriptionCreateSchema.parse(await readJsonBody(request))
          const row = await createSubscription(database, actor, body)
          const detail = await getSubscriptionDetail(database, row.id)
          return { body: { data: detail ?? row }, status: 201 }
        }),
    },
  },
})
