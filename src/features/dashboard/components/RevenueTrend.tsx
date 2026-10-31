import { Heading } from '@astryxdesign/core/Heading'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import { formatMoney } from '#/domain/money'
import type { MonthRevenue } from '#/features/dashboard/queries'

export function RevenueTrend({ rows, currency }: { rows: MonthRevenue[]; currency: string }) {
  if (rows.length === 0) return <Text>No revenue in this period.</Text>
  const peak = rows.reduce((max, row) => Math.max(max, row.revenueMinor), 0)
  return (
    <Stack gap={2}>
      <Heading level={2}>Revenue by month</Heading>
      <Table
        data={rows}
        idKey="month"
        columns={[
          { key: 'month', header: 'Month' },
          {
            key: 'revenueMinor',
            header: 'Revenue',
            renderCell: (row: MonthRevenue) => <Text>{formatMoney(row.revenueMinor, currency)}</Text>,
          },
          {
            key: 'trend',
            header: 'Share of peak',
            renderCell: (row: MonthRevenue) => (
              <ProgressBar label={`${row.month} revenue`} value={row.revenueMinor} max={Math.max(peak, 1)} hasValueLabel={false} />
            ),
          },
        ]}
      />
    </Stack>
  )
}
