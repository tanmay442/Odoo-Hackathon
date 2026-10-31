import { createFileRoute } from '@tanstack/react-router'

import { handleApiRead, handleApiWrite, readJsonBody, withoutCostPrice } from '#/features/api/handler'
import { createProduct } from '#/features/products/mutations'
import { listProducts, listVariants } from '#/features/products/queries'
import { productSchema } from '#/features/products/schema'

export const Route = createFileRoute('/api/v1/products')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        handleApiRead(request, 'read', async (database) => {
          const rows = await listProducts(database)
          return Promise.all(
            rows.map(async (row) => ({
              ...withoutCostPrice(row),
              variants: await listVariants(database, row.id),
            })),
          )
        }),
      POST: async ({ request }) =>
        handleApiWrite(request, 'write', async (database, actor) => {
          const body = productSchema.parse(await readJsonBody(request))
          const row = await createProduct(database, actor, body)
          return { body: { data: row }, status: 201 }
        }),
    },
  },
})
