import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import type { SubscriptionStatus } from '#/db/schema/subscriptions'
import { portalSubscriptionsFn } from '#/features/portal/functions'

function statusVariant(status: SubscriptionStatus) {
  if (status === 'active') return 'success' as const
  if (status === 'closed') return 'neutral' as const
  if (status === 'paused') return 'warning' as const
  return 'info' as const
}

export const Route = createFileRoute('/portal/subscriptions')({
  loader: async () => {
    const subscriptions = await portalSubscriptionsFn()
    if (subscriptions instanceof Response) {
      if (subscriptions.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return subscriptions
  },
  component: PortalSubscriptionsPage,
})

function PortalSubscriptionsPage() {
  const subscriptions = Route.useLoaderData()
  if (subscriptions.length === 0) {
    return (
      <Stack gap={3}>
        <Heading level={1}>Subscriptions</Heading>
        <Text>No subscriptions yet. Contact support to get started.</Text>
      </Stack>
    )
  }
  return (
    <Stack gap={3}>
      <Heading level={1}>Subscriptions</Heading>
      <Table
        data={subscriptions}
        idKey="id"
        columns={[
          { key: 'number', header: 'Number' },
          {
            key: 'status',
            header: 'Status',
            renderCell: (row: (typeof subscriptions)[number]) => (
              <Badge label={row.status} variant={statusVariant(row.status)} />
            ),
          },
          {
            key: 'startDate',
            header: 'Started',
            renderCell: (row: (typeof subscriptions)[number]) => (
              <Text>{new Date(row.startDate).toLocaleDateString('en-IN')}</Text>
            ),
          },
          {
            key: 'open',
            header: 'Detail',
            renderCell: (row: (typeof subscriptions)[number]) => (
              <Link to="/portal/subscriptions/$subscriptionId" params={{ subscriptionId: row.id }}>
                Open
              </Link>
            ),
          },
        ]}
      />
    </Stack>
  )
}
