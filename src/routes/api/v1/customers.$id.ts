import { createFileRoute } from '@tanstack/react-router'

import { handleApiRead, handleApiWrite, readJsonBody } from '#/features/api/handler'
import { getCustomer } from '#/features/customers/queries'
import { staffUpdateCustomer } from '#/features/customers/mutations'
import { customerSchema } from '#/features/customers/schema'

export const Route = createFileRoute('/api/v1/customers/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleApiRead(request, 'read', async (database) => {
          const row = await getCustomer(database, params.id)
          if (!row) throw Object.assign(new Error('Customer not found'), { status: 404, code: 'NOT_FOUND' })
          return row
        }),
      PATCH: async ({ request, params }) =>
        handleApiWrite(request, 'write', async (database, actor) => {
          const body = customerSchema.parse(await readJsonBody(request))
          const row = await staffUpdateCustomer(database, actor, { ...body, id: params.id })
          return { body: { data: row } }
        }),
    },
  },
})
