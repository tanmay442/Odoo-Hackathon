import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'

import type { SubscriptionRow } from '#/db/schema/subscriptions'
import { customerGetFn } from '#/features/customers/functions'
import { customerSubscriptionsFn } from '#/features/subscriptions/functions'

export const Route = createFileRoute('/app/customers/$customerId')({
  loader: async ({ params }) => {
    const customer = await customerGetFn({ data: { id: params.customerId } })
    if (customer instanceof Response) {
      if (customer.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    const subscriptions = await customerSubscriptionsFn({
      data: { customerId: params.customerId },
    })
    if (subscriptions instanceof Response) {
      if (subscriptions.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    if (!customer) throw new Error('NOT_FOUND')
    return { customer, subscriptions }
  },
  component: CustomerDetailPage,
})

type DetailSubscription = SubscriptionRow

function CustomerDetailPage() {
  const { customer, subscriptions } = Route.useLoaderData()
  const [tab, setTab] = useState('subscriptions')
  return (
    <Stack gap={3}>
      <Heading level={1}>{customer.displayName}</Heading>
      <Card>
        <Stack gap={1}>
          <Text type="body">{customer.email}</Text>
          {customer.phone ? (
            <Text type="supporting">{customer.phone}</Text>
          ) : null}
          {customer.billingAddress ? (
            <Text type="supporting">{customer.billingAddress}</Text>
          ) : null}
          <Text type="supporting">
            {customer.archivedAt ? 'Archived' : 'Live'}
          </Text>
        </Stack>
      </Card>
      <TabList value={tab} onChange={setTab} role="tablist">
        <Tab
          value="subscriptions"
          label="Subscriptions"
          panelId="panel-subscriptions"
        />
        <Tab value="invoices" label="Invoices" panelId="panel-invoices" />
        <Tab value="payments" label="Payments" panelId="panel-payments" />
      </TabList>
      {tab === 'subscriptions' ? (
        <Table
          data={subscriptions}
          idKey="id"
          columns={[
            { key: 'number', header: 'Number' },
            {
              key: 'status',
              header: 'Status',
              renderCell: (row: DetailSubscription) => (
                <Badge label={row.status} variant="info" />
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              renderCell: (row: DetailSubscription) => (
                <Button
                  label="Open"
                  size="sm"
                  onClick={() =>
                    (window.location.href = `/app/subscriptions/${row.id}`)
                  }
                />
              ),
            },
          ]}
        />
      ) : null}
      {tab === 'invoices' ? (
        <Card>
          <Text type="supporting">
            Invoices for this customer appear here in Phase 05.
          </Text>
        </Card>
      ) : null}
      {tab === 'payments' ? (
        <Card>
          <Text type="supporting">
            Payments for this customer appear here in Phase 06.
          </Text>
        </Card>
      ) : null}
    </Stack>
  )
}
