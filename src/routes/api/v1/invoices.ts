import { createFileRoute } from '@tanstack/react-router'

import { handleApiRead } from '#/features/api/handler'
import { listInvoices } from '#/features/invoices/queries'
import { invoiceListSchema } from '#/features/invoices/schema'

export const Route = createFileRoute('/api/v1/invoices')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        return handleApiRead(request, 'read', async (database) => {
          const params = invoiceListSchema.partial().parse({
            status: url.searchParams.get('status') ?? undefined,
            customerId: url.searchParams.get('customerId') ?? undefined,
            overdueOnly: url.searchParams.get('overdueOnly') === 'true' ? true : undefined,
            page: url.searchParams.get('page') ? Number(url.searchParams.get('page')) : undefined,
            pageSize: url.searchParams.get('pageSize') ? Number(url.searchParams.get('pageSize')) : undefined,
          })
          return listInvoices(database, params)
        })
      },
    },
  },
})
