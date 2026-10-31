import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import { formatMoney } from '#/domain/money'
import type { getInvoiceDetail } from '#/features/invoices/queries'

type InvoicePrintDetail = NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>

export function InvoicePrintSheet({ detail }: { detail: InvoicePrintDetail }) {
  return (
    <Stack gap={3}>
      <Heading level={1}>{`Invoice ${detail.number}`}</Heading>
      <Card>
        <Stack gap={1}>
          <Text type="body">{`Period: ${new Date(detail.periodStart).toLocaleDateString('en-IN')} to ${new Date(detail.periodEnd).toLocaleDateString('en-IN')}`}</Text>
          <Text type="supporting">{`Due: ${new Date(detail.dueDate).toLocaleDateString('en-IN')} · Status: ${detail.status}`}</Text>
        </Stack>
      </Card>
      <Table
        data={detail.lines}
        idKey="id"
        columns={[
          { key: 'description', header: 'Description' },
          { key: 'quantity', header: 'Qty' },
          {
            key: 'unitPriceMinor',
            header: 'Unit price',
            renderCell: (row: (typeof detail.lines)[number]) => formatMoney(row.unitPriceMinor, 'INR'),
          },
          {
            key: 'amountMinor',
            header: 'Amount',
            renderCell: (row: (typeof detail.lines)[number]) => formatMoney(row.amountMinor, 'INR'),
          },
        ]}
      />
      <Table
        data={detail.taxes}
        idKey="taxId"
        columns={[
          { key: 'taxId', header: 'Tax' },
          { key: 'rateBasisPoints', header: 'Rate (bps)' },
          {
            key: 'taxableAmountMinor',
            header: 'Taxable',
            renderCell: (row: (typeof detail.taxes)[number]) => formatMoney(row.taxableAmountMinor, 'INR'),
          },
          {
            key: 'taxAmountMinor',
            header: 'Tax',
            renderCell: (row: (typeof detail.taxes)[number]) => formatMoney(row.taxAmountMinor, 'INR'),
          },
        ]}
      />
      <Card>
        <Stack gap={1}>
          <Text type="body">{`Subtotal: ${formatMoney(detail.subtotalMinor, 'INR')}`}</Text>
          <Text type="body">{`Discount: ${formatMoney(detail.discountMinor, 'INR')}`}</Text>
          <Text type="body">{`Tax: ${formatMoney(detail.taxMinor, 'INR')}`}</Text>
          <Text type="body">{`Total: ${formatMoney(detail.totalMinor, 'INR')}`}</Text>
        </Stack>
      </Card>
    </Stack>
  )
}
