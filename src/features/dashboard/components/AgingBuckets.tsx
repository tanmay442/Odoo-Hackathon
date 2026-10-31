import { Heading } from '@astryxdesign/core/Heading'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import { formatMoney } from '#/domain/money'
import type { AgingBucket } from '#/features/dashboard/queries'

const bucketLabels: Record<AgingBucket['bucket'], string> = {
  current: 'Current',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '60+': '60+ days',
}

export function AgingBuckets({ rows, currency }: { rows: AgingBucket[]; currency: string }) {
  const total = rows.reduce((sum, row) => sum + row.amountMinor, 0)
  if (total === 0) return <Text>No open balances in this period.</Text>
  return (
    <Stack gap={2}>
      <Heading level={2}>Aging buckets</Heading>
      <Table
        data={rows}
        idKey="bucket"
        columns={[
          {
            key: 'bucket',
            header: 'Bucket',
            renderCell: (row: AgingBucket) => <Text>{bucketLabels[row.bucket]}</Text>,
          },
          { key: 'count', header: 'Invoices' },
          {
            key: 'amountMinor',
            header: 'Amount',
            renderCell: (row: AgingBucket) => <Text>{formatMoney(row.amountMinor, currency)}</Text>,
          },
          {
            key: 'share',
            header: 'Share',
            renderCell: (row: AgingBucket) => (
              <ProgressBar label={`${bucketLabels[row.bucket]} share`} value={row.amountMinor} max={total} hasValueLabel={false} />
            ),
          },
        ]}
      />
    </Stack>
  )
}
