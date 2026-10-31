import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'

import { formatMoney } from '#/domain/money'
import type { DashboardSummary } from '#/features/dashboard/queries'

export function SummaryCards({ summary }: { summary: DashboardSummary }) {
  const breakdown = summary.byStatus.map((entry) => `${entry.status}: ${entry.count}`).join(' · ')
  return (
    <Grid columns={{ minWidth: 240, max: 4 }}>
      <Card>
        <Heading level={3}>Active subscriptions</Heading>
        <Text>{summary.activeSubscriptions}</Text>
        <Text>{breakdown || 'No subscriptions in scope'}</Text>
      </Card>
      <Card>
        <Heading level={3}>Revenue received</Heading>
        <Text>{formatMoney(summary.revenueMinor, summary.currency)}</Text>
        <Text>Verified payments in period</Text>
      </Card>
      <Card>
        <Heading level={3}>Outstanding</Heading>
        <Text>{formatMoney(summary.outstandingMinor, summary.currency)}</Text>
        <Text>{summary.outstandingCount} open invoices</Text>
      </Card>
      <Card>
        <Heading level={3}>Overdue</Heading>
        <Text>{formatMoney(summary.overdueMinor, summary.currency)}</Text>
        <Text>{summary.overdueCount} overdue invoices</Text>
      </Card>
    </Grid>
  )
}
