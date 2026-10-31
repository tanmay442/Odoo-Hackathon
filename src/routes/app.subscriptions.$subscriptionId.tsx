import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Step, Stepper } from '@astryxdesign/core/Stepper'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import type { SubscriptionStatus } from '#/db/schema/subscriptions'
import { formatMoney } from '#/domain/money'
import { allowedSubscriptionTargets } from '#/domain/state-machines'
import { planListFn } from '#/features/plans/functions'
import { productPickerFn } from '#/features/products/functions'
import { subscriptionGetFn, subscriptionTransitionFn, subscriptionUpdateLinesFn } from '#/features/subscriptions/functions'
import { SubscriptionLineEditor  } from '#/features/subscriptions/components/SubscriptionLineEditor'
import type {EditableLine} from '#/features/subscriptions/components/SubscriptionLineEditor';
import { taxPickerFn } from '#/features/taxes/functions'

const stepperStages: SubscriptionStatus[] = ['draft', 'quotation', 'confirmed', 'active', 'closed']

export const Route = createFileRoute('/app/subscriptions/$subscriptionId')({
  loader: async ({ params }) => {
    const [detail, plans, products, taxes] = await Promise.all([
      subscriptionGetFn({ data: { id: params.subscriptionId } }),
      planListFn(),
      productPickerFn(),
      taxPickerFn(),
    ])
    for (const result of [detail, plans, products, taxes]) {
      if (result instanceof Response) {
        if ((result).status === 401) throw redirect({ to: '/sign-in' })
        throw new Error('FORBIDDEN')
      }
    }
    if (!detail || detail instanceof Response) throw new Error('NOT_FOUND')
    return {
      detail: detail,
      plans: plans as Exclude<typeof plans, Response>,
      products: products as Exclude<typeof products, Response>,
      taxes: taxes as Exclude<typeof taxes, Response>,
    }
  },
  component: SubscriptionDetailPage,
})

function SubscriptionDetailPage() {
  const { detail, plans, products, taxes } = Route.useLoaderData()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [lines, setLines] = useState<EditableLine[]>(
    detail.lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxIds: line.taxIds,
    })),
  )
  const plan = plans.find((candidate) => candidate.id === detail.planId)
  const flags = {
    allowEarlyClose: plan?.allowEarlyClose ?? false,
    allowPause: plan?.allowPause ?? false,
    allowRenew: plan?.allowRenew ?? false,
  }
  const targets = allowedSubscriptionTargets(detail.status, flags)
  const activeStep = detail.status === 'paused' ? 3 : Math.max(0, stepperStages.indexOf(detail.status))

  async function move(to: SubscriptionStatus) {
    setError(null)
    const result = await subscriptionTransitionFn({ data: { id: detail.id, to } })
    if (result instanceof Response) {
      setError(result.status === 409 ? `Cannot move ${detail.status} to ${to}.` : 'Move refused.')
      return
    }
    await router.invalidate()
  }

  async function saveLines() {
    setError(null)
    const result = await subscriptionUpdateLinesFn({ data: { id: detail.id, lines } })
    if (result instanceof Response) {
      setError('Saving lines failed. Lines are editable only in draft or quotation.')
      return
    }
    setIsEditing(false)
    await router.invalidate()
  }

  const canEditLines = detail.status === 'draft' || detail.status === 'quotation'

  return (
    <Stack gap={3}>
      <Stack direction="horizontal" gap={2}>
        <Heading level={1}>{detail.number}</Heading>
        <Badge label={detail.status} variant="info" />
      </Stack>
      {error ? <Banner status="error" title={error} /> : null}
      <Stepper activeStep={activeStep}>
        {stepperStages.map((stage, index) => (
          <Step key={stage} step={index} label={stage} />
        ))}
      </Stepper>
      <Card>
        <Stack gap={1}>
          <Text type="body">{`Period: ${detail.currentPeriodStart ? new Date(detail.currentPeriodStart).toLocaleDateString('en-IN') : '—'} to ${detail.currentPeriodEnd ? new Date(detail.currentPeriodEnd).toLocaleDateString('en-IN') : '—'}`}</Text>
          <Text type="supporting">{`Next billing: ${detail.nextBillingAt ? new Date(detail.nextBillingAt).toLocaleDateString('en-IN') : '—'}`}</Text>
          {plan ? (
            <Text type="supporting">{`Plan allows pause: ${flags.allowPause ? 'yes' : 'no'} · early close: ${flags.allowEarlyClose ? 'yes' : 'no'} · renew: ${flags.allowRenew ? 'yes' : 'no'}`}</Text>
          ) : null}
        </Stack>
      </Card>
      <Stack direction="horizontal" gap={2}>
        {targets.map((target) => (
          <Button key={target} label={target === 'paused' ? 'Pause' : target === 'closed' ? 'Close' : target === 'active' && detail.status === 'closed' ? 'Renew' : `Move to ${target}`} onClick={() => void move(target)} />
        ))}
      </Stack>
      <Heading level={2}>Lines</Heading>
      {isEditing ? (
        <Stack gap={2}>
          <SubscriptionLineEditor lines={lines} products={products} taxes={taxes} onChange={setLines} />
          <Stack direction="horizontal" gap={2}>
            <Button label="Save lines" variant="primary" onClick={() => void saveLines()} />
            <Button label="Cancel" onClick={() => setIsEditing(false)} />
          </Stack>
        </Stack>
      ) : (
        <Stack gap={2}>
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
            ]}
          />
          {canEditLines ? <Button label="Edit lines" onClick={() => setIsEditing(true)} /> : null}
        </Stack>
      )}
      <Heading level={2}>Activity</Heading>
      <Table
        data={detail.events}
        idKey="id"
        columns={[
          { key: 'eventType', header: 'Event' },
          { key: 'actor', header: 'Actor' },
        ]}
      />
    </Stack>
  )
}
