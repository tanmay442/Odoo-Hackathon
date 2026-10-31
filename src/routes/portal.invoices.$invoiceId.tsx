import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

import { portalInvoiceFn } from '#/features/portal/functions'
import { InvoicePrintSheet } from '#/features/invoices/components/InvoicePrintSheet'
import { InvoicePaymentStatus } from '#/features/portal/components/InvoicePaymentStatus'
import { PaymentClaimForm } from '#/features/portal/components/PaymentClaimForm'

export const Route = createFileRoute('/portal/invoices/$invoiceId')({
  loader: async ({ params }) => {
    const invoice = await portalInvoiceFn({ data: { id: params.invoiceId } })
    if (invoice instanceof Response) {
      if (invoice.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return invoice
  },
  component: PortalInvoiceDetailPage,
})

function PortalInvoiceDetailPage() {
  const { detail, payments } = Route.useLoaderData()
  const router = useRouter()
  const balanceMinor = detail.totalMinor - detail.amountPaidMinor

  return (
    <Stack gap={3}>
      <Stack direction="horizontal" gap={2}>
        <Heading level={1}>{`Invoice ${detail.number}`}</Heading>
        <Link to="/portal/invoices/$invoiceId/print" params={{ invoiceId: detail.id }}>
          Print
        </Link>
      </Stack>
      <InvoicePrintSheet detail={detail} />
      <InvoicePaymentStatus payments={payments} />
      {detail.status === 'confirmed' && balanceMinor > 0 ? (
        <PaymentClaimForm
          invoiceId={detail.id}
          balanceMinor={balanceMinor}
          currency="INR"
          onSubmitted={() => void router.invalidate()}
        />
      ) : (
        <Text type="supporting">This invoice needs no payment right now.</Text>
      )}
    </Stack>
  )
}
