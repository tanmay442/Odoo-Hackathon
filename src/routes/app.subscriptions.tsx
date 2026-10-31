import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Selector } from '@astryxdesign/core/Selector'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import type { SubscriptionStatus } from '#/db/schema/subscriptions'
import { allowedSubscriptionTargets } from '#/domain/state-machines'
import { planListFn } from '#/features/plans/functions'
import { subscriptionListFn, subscriptionTransitionFn } from '#/features/subscriptions/functions'

const columns: SubscriptionStatus[] = ['draft', 'quotation', 'confirmed', 'active', 'closed']

export const Route = createFileRoute('/app/subscriptions')({
  loader: async () => {
    const [result, plans] = await Promise.all([subscriptionListFn({ data: {} }), planListFn()])
    if (result instanceof Response) {
      if (result.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    if (plans instanceof Response) throw new Error('FORBIDDEN')
    return { initial: result, plans }
  },
  component: SubscriptionsPage,
})

type SubscriptionRow = Exclude<Awaited<ReturnType<typeof subscriptionListFn>>, Response>['rows'][number]

function planFlagsFor(plans: Array<{ id: string; allowEarlyClose: boolean; allowPause: boolean; allowRenew: boolean }>, planId: string) {
  return (
    plans.find((plan) => plan.id === planId) ?? { allowEarlyClose: false, allowPause: false, allowRenew: false }
  )
}

function SubscriptionsPage() {
  const { initial, plans } = Route.useLoaderData()
  const router = useRouter()
  const [status, setStatus] = useState<SubscriptionStatus | ''>('')
  const [data, setData] = useState(initial)
  const [view, setView] = useState<'table' | 'board'>('table')
  const [error, setError] = useState<string | null>(null)

  async function reload(nextStatus: SubscriptionStatus | '') {
    const result = await subscriptionListFn({ data: nextStatus ? { status: nextStatus } : {} })
    if (result instanceof Response) {
      setError('Loading failed. Try again.')
      return
    }
    setData(result)
  }

  async function move(row: SubscriptionRow, to: SubscriptionStatus) {
    setError(null)
    const result = await subscriptionTransitionFn({ data: { id: row.id, to } })
    if (result instanceof Response) {
      setError(result.status === 409 ? `Cannot move ${row.status} to ${to}.` : 'Move refused.')
      return
    }
    await reload(status)
  }

  return (
    <Stack gap={3}>
      <Stack direction="horizontal" gap={2}>
        <Heading level={1}>Subscriptions</Heading>
        <Button label="New subscription" variant="primary" onClick={() => (window.location.href = '/app/subscriptions-new')} />
        <Button label={view === 'table' ? 'Board view' : 'Table view'} onClick={() => setView(view === 'table' ? 'board' : 'table')} />
      </Stack>
      {error ? <Banner status="error" title={error} /> : null}
      <Selector
        label="Status filter"
        options={columns.map((column) => ({ value: column, label: column }))}
        value={status === '' ? null : status}
        onChange={(value) => void (setStatus((value as SubscriptionStatus | null) ?? ''), reload((value as SubscriptionStatus | null) ?? ''))}
        hasClear
        isOptional
        placeholder="All statuses"
      />
      {view === 'table' ? (
        <Table
          data={data.rows}
          idKey="id"
          columns={[
            { key: 'number', header: 'Number' },
            {
              key: 'status',
              header: 'Status',
              renderCell: (row: SubscriptionRow) => <Badge label={row.status} variant="info" />,
            },
            {
              key: 'actions',
              header: 'Actions',
              renderCell: (row: SubscriptionRow) => (
                <Button label="Open" size="sm" onClick={() => (window.location.href = `/app/subscriptions/${row.id}`)} />
              ),
            },
          ]}
        />
      ) : (
        <Stack direction="horizontal" gap={2}>
          {columns.map((column) => (
            <Card key={column}>
              <Stack gap={2}>
                <Heading level={2}>{column}</Heading>
                {data.rows
                  .filter((row) => row.status === column || (column === 'active' && row.status === 'paused'))
                  .map((row) => {
                    const flags = planFlagsFor(plans, row.planId)
                    const targets = allowedSubscriptionTargets(row.status, flags)
                    return (
                      <Card key={row.id}>
                        <Stack gap={1}>
                          <Text type="body">{row.number}</Text>
                          <Badge label={row.status} variant="info" />
                          {targets.map((target) => (
                            <Button key={target} label={`Move to ${target}`} size="sm" onClick={() => void move(row, target)} />
                          ))}
                          <Button label="Open" size="sm" onClick={() => (window.location.href = `/app/subscriptions/${row.id}`)} />
                        </Stack>
                      </Card>
                    )
                  })}
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
      <Stack direction="horizontal" gap={2}>
        <Button label="Previous" size="sm" onClick={() => void router.invalidate()} isDisabled={data.page <= 1} />
        <Text type="supporting">{`${data.total} subscriptions`}</Text>
      </Stack>
    </Stack>
  )
}
