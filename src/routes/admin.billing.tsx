import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

import { billingRunFn, billingStatusFn } from '#/features/invoices/functions'

export const Route = createFileRoute('/admin/billing')({
  loader: async () => {
    const status = await billingStatusFn()
    if (status instanceof Response) {
      if (status.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return status
  },
  component: BillingAdminPage,
})

function BillingAdminPage() {
  const initial = Route.useLoaderData()
  const [status, setStatus] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  async function runBilling() {
    setError(null)
    setIsRunning(true)
    try {
      const summary = await billingRunFn()
      if (summary instanceof Response) {
        setError('Billing run refused.')
        return
      }
      const refreshed = await billingStatusFn()
      if (!(refreshed instanceof Response)) setStatus(refreshed)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <Stack gap={3}>
      <Stack direction="horizontal" gap={2}>
        <Heading level={1}>Billing</Heading>
        <Button label={isRunning ? 'Running…' : 'Run billing now'} variant="primary" onClick={() => void runBilling()} isDisabled={isRunning} />
        <Badge label={`${status.dueCount} due`} variant="info" />
      </Stack>
      {error ? <Banner status="error" title={error} /> : null}
      <Card>
        <Stack gap={1}>
          <Text type="body">{`Due subscriptions: ${status.dueCount}`}</Text>
          {status.latest?.summary ? (
            <Text type="supporting">{`Last run: ${new Date(status.latest.startedAt).toLocaleString('en-IN')} · invoiced ${status.latest.summary.invoiced} of ${status.latest.summary.scanned} scanned · skipped ${status.latest.summary.skippedAlreadyBilled} · closed ${status.latest.summary.closed}${status.latest.summary.truncated ? ' · more due remain' : ''}`}</Text>
          ) : (
            <Text type="supporting">No runs yet.</Text>
          )}
          {status.latest?.summary && status.latest.summary.errors.length > 0 ? (
            <Text type="supporting">{`${status.latest.summary.errors.length} errors: ${status.latest.summary.errors.map((entry) => entry.subscriptionId).join(', ')}`}</Text>
          ) : null}
        </Stack>
      </Card>
    </Stack>
  )
}
