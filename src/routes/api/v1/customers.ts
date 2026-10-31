import { createFileRoute } from '@tanstack/react-router'

import { handleApiRead, handleApiWrite, readJsonBody } from '#/features/api/handler'
import { createCustomer } from '#/features/customers/mutations'
import { listCustomers } from '#/features/customers/queries'
import { customerSchema } from '#/features/customers/schema'

export const Route = createFileRoute('/api/v1/customers')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        return handleApiRead(request, 'read', async (database) => {
          const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
          const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 20) || 20))
          return listCustomers(database, {
            search: url.searchParams.get('search') ?? undefined,
            page,
            pageSize,
          })
        })
      },
      POST: async ({ request }) =>
        handleApiWrite(request, 'write', async (database, actor) => {
          const body = customerSchema.parse(await readJsonBody(request))
          const row = await createCustomer(database, actor, body)
          return { body: { data: row }, status: 201 }
        }),
    },
  },
})
