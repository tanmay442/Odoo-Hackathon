import { createFileRoute } from '@tanstack/react-router'

import { handleApiWrite, readJsonBody } from '#/features/api/handler'
import { subscriptionTransitionSchema } from '#/features/subscriptions/schema'
import { transitionSubscription } from '#/features/subscriptions/transitions'

export const Route = createFileRoute('/api/v1/subscriptions/$id/transition')({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        handleApiWrite(request, 'write', async (database, actor) => {
          const body = subscriptionTransitionSchema.omit({ id: true }).parse(await readJsonBody(request))
          const row = await transitionSubscription(database, actor, params.id, body.to)
          return { body: { data: row } }
        }),
    },
  },
})
