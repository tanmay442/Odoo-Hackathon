import { createFileRoute } from '@tanstack/react-router'

import { handleApiRead, handleApiWrite, readJsonBody } from '#/features/api/handler'
import { createPlan } from '#/features/plans/mutations'
import { listPlans } from '#/features/plans/queries'
import { planSchema } from '#/features/plans/schema'

export const Route = createFileRoute('/api/v1/plans')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        handleApiRead(request, 'read', async (database) => listPlans(database)),
      POST: async ({ request }) =>
        handleApiWrite(request, 'write', async (database, actor) => {
          const body = planSchema.parse(await readJsonBody(request))
          const row = await createPlan(database, actor, body)
          return { body: { data: row }, status: 201 }
        }),
    },
  },
})
