import { createFileRoute, redirect } from '@tanstack/react-router'

import { invoiceGetFn } from '#/features/invoices/functions'
import { InvoicePrintSheet } from '#/features/invoices/components/InvoicePrintSheet'

export const Route = createFileRoute('/app/invoices/$invoiceId/print')({
  loader: async ({ params }) => {
    const detail = await invoiceGetFn({ data: { id: params.invoiceId } })
    if (detail instanceof Response) {
      if (detail.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    if (!detail) throw new Error('NOT_FOUND')
    return detail
  },
  component: InvoicePrintPage,
})

function InvoicePrintPage() {
  const detail = Route.useLoaderData()
  return (
    <main>
      <InvoicePrintSheet detail={detail} />
    </main>
  )
}
