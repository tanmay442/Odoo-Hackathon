import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import { formatMoney } from '#/domain/money'
import type { OverdueInvoiceEntry } from '#/features/dashboard/overdue'

interface OverdueTableProps {
  rows: OverdueInvoiceEntry[]
  total: number
  currency: string
  chasingId: string | null
  onChase: (invoiceId: string) => void
}

export function OverdueTable({ rows, total, currency, chasingId, onChase }: OverdueTableProps) {
  if (rows.length === 0) return <Text>No overdue invoices in this period.</Text>
  return (
    <Stack gap={2}>
      <Heading level={2}>Overdue invoices ({total})</Heading>
      <Table
        data={rows}
        idKey="invoiceId"
        columns={[
          { key: 'invoiceNumber', header: 'Invoice' },
          { key: 'customerName', header: 'Customer' },
          { key: 'planName', header: 'Plan' },
          {
            key: 'dueDate',
            header: 'Due',
            renderCell: (row: OverdueInvoiceEntry) => (
              <Text>{new Date(row.dueDate).toLocaleDateString('en-IN')}</Text>
            ),
          },
          { key: 'daysOverdue', header: 'Days overdue' },
          {
            key: 'balanceMinor',
            header: 'Balance',
            renderCell: (row: OverdueInvoiceEntry) => (
              <Text>{formatMoney(row.balanceMinor, currency)}</Text>
            ),
          },
          {
            key: 'chase',
            header: 'Chase',
            renderCell: (row: OverdueInvoiceEntry) => (
              <Button
                label="Chase"
                size="sm"
                isLoading={chasingId === row.invoiceId}
                isDisabled={chasingId !== null}
                onClick={() => onChase(row.invoiceId)}
              />
            ),
          },
        ]}
      />
    </Stack>
  )
}
