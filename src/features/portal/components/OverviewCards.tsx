import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'

import { formatMoney } from '#/domain/money'
import type { PortalOverview } from '#/features/portal/queries'

export function OverviewCards({ overview }: { overview: PortalOverview }) {
  const currentPlan =
    overview.activeSubscriptions.length === 0
      ? 'No active plan'
      : overview.activeSubscriptions.length === 1
        ? overview.activeSubscriptions[0].planName
        : `${overview.activeSubscriptions[0].planName} +${overview.activeSubscriptions.length - 1} more`
  return (
    <Grid columns={{ minWidth: 240, max: 3 }}>
      <Card>
        <Heading level={3}>Current plan</Heading>
        <Text>{currentPlan}</Text>
        <Text>{`${overview.activeSubscriptions.length} active subscriptions`}</Text>
      </Card>
      <Card>
        <Heading level={3}>Next billing date</Heading>
        <Text>
          {overview.nextBillingAt
            ? new Date(overview.nextBillingAt).toLocaleDateString('en-IN')
            : 'Nothing scheduled'}
        </Text>
        <Text>Next invoice due across active plans</Text>
      </Card>
      <Card>
        <Heading level={3}>Balance due</Heading>
        <Text>{formatMoney(overview.balanceDueMinor, overview.currency)}</Text>
        <Text>Open confirmed invoices</Text>
      </Card>
    </Grid>
  )
}
