import { createFileRoute, redirect } from '@tanstack/react-router'

import { portalInvoiceFn } from '#/features/portal/functions'
import { InvoicePrintSheet } from '#/features/invoices/components/InvoicePrintSheet'

export const Route = createFileRoute('/portal/invoices/$invoiceId/print')({
  loader: async ({ params }) => {
    const invoice = await portalInvoiceFn({ data: { id: params.invoiceId } })
    if (invoice instanceof Response) {
      if (invoice.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return invoice.detail
  },
  component: PortalInvoicePrintPage,
})

function PortalInvoicePrintPage() {
  const detail = Route.useLoaderData()
  return (
    <main>
      <InvoicePrintSheet detail={detail} />
    </main>
  )
}
