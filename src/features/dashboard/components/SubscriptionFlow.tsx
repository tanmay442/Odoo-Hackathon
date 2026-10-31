import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import type { MonthFlow } from '#/features/dashboard/queries'

export function SubscriptionFlow({ rows }: { rows: MonthFlow[] }) {
  if (rows.length === 0) return <Text>No subscription movement in this period.</Text>
  return (
    <Stack gap={2}>
      <Heading level={2}>New vs closed subscriptions</Heading>
      <Table
        data={rows}
        idKey="month"
        columns={[
          { key: 'month', header: 'Month' },
          { key: 'opened', header: 'Opened' },
          { key: 'closed', header: 'Closed' },
        ]}
      />
    </Stack>
  )
}
