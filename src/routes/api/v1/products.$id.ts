import { createFileRoute } from '@tanstack/react-router'

import { handleApiRead, withoutCostPrice } from '#/features/api/handler'
import { getProduct, listVariants } from '#/features/products/queries'

function notFound(): never {
  throw Object.assign(new Error('Product not found'), { status: 404, code: 'NOT_FOUND' })
}

export const Route = createFileRoute('/api/v1/products/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleApiRead(request, 'read', async (database) => {
          const row = await getProduct(database, params.id)
          if (!row) notFound()
          return { ...withoutCostPrice(row), variants: await listVariants(database, params.id) }
        }),
    },
  },
})
