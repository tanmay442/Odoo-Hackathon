import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import type { InvoiceStatus } from '#/db/schema/invoices'
import { formatMoney } from '#/domain/money'
import { portalInvoicesFn } from '#/features/portal/functions'

function statusVariant(status: InvoiceStatus) {
  if (status === 'paid') return 'success' as const
  if (status === 'cancelled') return 'neutral' as const
  if (status === 'confirmed') return 'info' as const
  return 'warning' as const
}

export const Route = createFileRoute('/portal/invoices')({
  loader: async () => {
    const invoices = await portalInvoicesFn({ data: {} })
    if (invoices instanceof Response) {
      if (invoices.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return invoices
  },
  component: PortalInvoicesPage,
})

function PortalInvoicesPage() {
  const invoices = Route.useLoaderData()
  if (invoices.total === 0) {
    return (
      <Stack gap={3}>
        <Heading level={1}>Invoices</Heading>
        <Text>No invoices yet.</Text>
      </Stack>
    )
  }
  return (
    <Stack gap={3}>
      <Heading level={1}>Invoices</Heading>
      <Table
        data={invoices.rows}
        idKey="id"
        columns={[
          { key: 'number', header: 'Number' },
          {
            key: 'status',
            header: 'Status',
            renderCell: (row: (typeof invoices.rows)[number]) => (
              <Badge label={row.status} variant={statusVariant(row.status)} />
            ),
          },
          {
            key: 'totalMinor',
            header: 'Total',
            renderCell: (row: (typeof invoices.rows)[number]) => (
              <Text>{formatMoney(row.totalMinor, 'INR')}</Text>
            ),
          },
          {
            key: 'dueDate',
            header: 'Due',
            renderCell: (row: (typeof invoices.rows)[number]) => (
              <Text>{new Date(row.dueDate).toLocaleDateString('en-IN')}</Text>
            ),
          },
          {
            key: 'open',
            header: 'Detail',
            renderCell: (row: (typeof invoices.rows)[number]) => (
              <Link to="/portal/invoices/$invoiceId" params={{ invoiceId: row.id }}>
                Open
              </Link>
            ),
          },
        ]}
      />
    </Stack>
  )
}
