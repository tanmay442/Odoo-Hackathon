import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Step, Stepper } from '@astryxdesign/core/Stepper'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import type { SubscriptionStatus } from '#/db/schema/subscriptions'
import { formatMoney } from '#/domain/money'
import { portalSubscriptionFn } from '#/features/portal/functions'
import { SubscriptionActions } from '#/features/portal/components/SubscriptionActions'

const stepperStages: SubscriptionStatus[] = ['draft', 'quotation', 'confirmed', 'active', 'closed']

export const Route = createFileRoute('/portal/subscriptions/$subscriptionId')({
  loader: async ({ params }) => {
    const subscription = await portalSubscriptionFn({ data: { id: params.subscriptionId } })
    if (subscription instanceof Response) {
      if (subscription.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return subscription
  },
  component: PortalSubscriptionDetailPage,
})

function PortalSubscriptionDetailPage() {
  const { detail, planName, allowedActions } = Route.useLoaderData()
  const router = useRouter()
  const activeStep = detail.status === 'paused' ? 3 : Math.max(0, stepperStages.indexOf(detail.status))

  return (
    <Stack gap={3}>
      <Heading level={1}>{`Subscription ${detail.number}`}</Heading>
      <Card>
        <Stack gap={1}>
          <Text type="body">{`Plan: ${planName}`}</Text>
          <Text type="supporting">
            {`Period: ${new Date(detail.startDate).toLocaleDateString('en-IN')} to ${new Date(detail.expiryDate).toLocaleDateString('en-IN')}`}
          </Text>
        </Stack>
      </Card>
      <Stepper activeStep={activeStep}>
        {stepperStages.map((stage, index) => (
          <Step key={stage} step={index} label={stage} />
        ))}
      </Stepper>
      <SubscriptionActions
        subscriptionId={detail.id}
        allowedActions={allowedActions}
        onChanged={() => void router.invalidate()}
      />
      <Table
        data={detail.lines}
        idKey="id"
        columns={[
          { key: 'description', header: 'Description' },
          { key: 'quantity', header: 'Qty' },
          {
            key: 'unitPriceMinor',
            header: 'Unit price',
            renderCell: (row: (typeof detail.lines)[number]) => (
              <Text>{formatMoney(row.unitPriceMinor, 'INR')}</Text>
            ),
          },
        ]}
      />
      <Text type="supporting">Lifecycle actions appear only when your plan allows them.</Text>
      <Badge label={detail.status} variant="info" />
    </Stack>
  )
}
