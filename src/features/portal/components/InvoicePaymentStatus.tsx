import { Badge } from '@astryxdesign/core/Badge'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import { formatMoney } from '#/domain/money'
import type { PortalPaymentDisplay } from '#/features/portal/queries'

function statusVariant(status: PortalPaymentDisplay['displayStatus']) {
  if (status === 'Verified') return 'success' as const
  if (status === 'Rejected' || status === 'Failed') return 'error' as const
  if (status === 'Submitted') return 'warning' as const
  return 'neutral' as const
}

export function InvoicePaymentStatus({ payments }: { payments: PortalPaymentDisplay[] }) {
  if (payments.length === 0) return <Text>No payments submitted for this invoice yet.</Text>
  return (
    <Stack gap={2}>
      <Heading level={2}>Payments</Heading>
      <Table
        data={payments}
        idKey="id"
        columns={[
          {
            key: 'amountMinor',
            header: 'Amount',
            renderCell: (row: PortalPaymentDisplay) => (
              <Text>{formatMoney(row.amountMinor, row.currency)}</Text>
            ),
          },
          { key: 'method', header: 'Method' },
          {
            key: 'displayStatus',
            header: 'Status',
            renderCell: (row: PortalPaymentDisplay) => (
              <Badge label={row.displayStatus} variant={statusVariant(row.displayStatus)} />
            ),
          },
          {
            key: 'rejectReason',
            header: 'Staff note',
            renderCell: (row: PortalPaymentDisplay) => <Text>{row.rejectReason ?? '—'}</Text>,
          },
        ]}
      />
    </Stack>
  )
}
