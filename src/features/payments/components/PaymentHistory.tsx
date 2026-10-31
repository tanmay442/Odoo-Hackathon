import { Badge } from '@astryxdesign/core/Badge'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import type { PaymentEventRow, PaymentRow } from '#/db/schema/payments'
import { formatMoney } from '#/domain/money'

function statusVariant(status: PaymentRow['status']) {
  if (status === 'verified') return 'success' as const
  if (status === 'pending_verification') return 'warning' as const
  if (status === 'rejected' || status === 'failed') return 'error' as const
  if (status === 'recorded') return 'info' as const
  return 'neutral' as const
}

function eventSummary(event: PaymentEventRow): string {
  if (
    event.eventType === 'rejected' &&
    typeof event.payload.reason === 'string'
  ) {
    return `rejected — ${event.payload.reason}`
  }
  if (event.eventType === 'failed' && typeof event.payload.error === 'string') {
    return `failed — ${event.payload.error}`
  }
  return event.eventType
}

interface PaymentHistoryProps {
  payments: PaymentRow[]
  events: PaymentEventRow[]
  currency: string
}

export function PaymentHistory({
  payments,
  events,
  currency,
}: PaymentHistoryProps) {
  return (
    <Stack gap={2}>
      <Heading level={3}>Payments</Heading>
      {payments.length === 0 ? (
        <Text type="supporting">No payments recorded yet.</Text>
      ) : (
        <Table
          data={payments}
          idKey="id"
          columns={[
            { key: 'method', header: 'Method' },
            {
              key: 'amountMinor',
              header: 'Amount',
              renderCell: (row: PaymentRow) =>
                formatMoney(row.amountMinor, currency),
            },
            { key: 'paidOn', header: 'Paid on' },
            {
              key: 'status',
              header: 'Status',
              renderCell: (row: PaymentRow) => (
                <Badge label={row.status} variant={statusVariant(row.status)} />
              ),
            },
            { key: 'note', header: 'Note' },
          ]}
        />
      )}
      <Heading level={3}>Audit trail</Heading>
      {events.length === 0 ? (
        <Text type="supporting">No payment events yet.</Text>
      ) : (
        <Table
          data={events}
          idKey="id"
          columns={[
            {
              key: 'createdAt',
              header: 'When',
              renderCell: (row: PaymentEventRow) =>
                new Date(row.createdAt).toLocaleString('en-IN'),
            },
            {
              key: 'eventType',
              header: 'Event',
              renderCell: (row: PaymentEventRow) => eventSummary(row),
            },
            { key: 'actor', header: 'Actor' },
          ]}
        />
      )}
    </Stack>
  )
}
