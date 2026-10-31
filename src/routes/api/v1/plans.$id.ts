import { createFileRoute } from '@tanstack/react-router'

import { handleApiRead } from '#/features/api/handler'
import { getPlan } from '#/features/plans/queries'

export const Route = createFileRoute('/api/v1/plans/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleApiRead(request, 'read', async (database) => {
          const row = await getPlan(database, params.id)
          if (!row) {
            throw Object.assign(new Error('Plan not found'), { status: 404, code: 'NOT_FOUND' })
          }
          return row
        }),
    },
  },
})
