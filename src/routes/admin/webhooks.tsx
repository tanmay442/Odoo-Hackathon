import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'

import type { WebhookDeliveryRow, WebhookEndpointRow } from '#/db/schema/webhooks'
import {
  webhookCreateFn,
  webhookDeleteFn,
  webhookDeliveriesFn,
  webhookListFn,
  webhookRedeliverFn,
  webhookToggleFn,
} from '#/features/webhooks/functions'
import { webhookEventTypes } from '#/db/schema/webhooks'

export const Route = createFileRoute('/admin/webhooks')({
  loader: async () => {
    const [endpoints, deliveries] = await Promise.all([webhookListFn(), webhookDeliveriesFn({ data: { limit: 100 } })])
    if (endpoints instanceof Response) {
      if (endpoints.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    if (deliveries instanceof Response) throw new Error('FORBIDDEN')
    return { endpoints, deliveries }
  },
  component: WebhooksPage,
})

function WebhooksPage() {
  const { endpoints, deliveries } = Route.useLoaderData()
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>([...webhookEventTypes])
  const [plainSecret, setPlainSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  function toggleEvent(type: string, enabled: boolean) {
    setEvents((current) => (enabled ? [...current, type] : current.filter((entry) => entry !== type)))
  }

  async function create() {
    if (url.trim() === '' || events.length === 0) {
      setError('Enter a URL and pick at least one event.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const result = await webhookCreateFn({
        data: { url: url.trim(), eventTypes: events as ('invoice.generated' | 'invoice.paid' | 'payment.verified' | 'subscription.activated' | 'subscription.closed' | 'subscription.paused')[] },
      })
      if (result instanceof Response) throw new Error('Create refused')
      setPlainSecret(result.plainSecret)
      setUrl('')
      await router.invalidate()
    } catch {
      setError('Endpoint creation failed. Check the URL and try again.')
    } finally {
      setIsSaving(false)
    }
  }

  async function toggle(row: WebhookEndpointRow) {
    const result = await webhookToggleFn({ data: { id: row.id, isActive: !row.isActive } })
    if (result instanceof Response) {
      setError('Update failed. Try again.')
      return
    }
    await router.invalidate()
  }

  async function remove(row: WebhookEndpointRow) {
    const result = await webhookDeleteFn({ data: { id: row.id } })
    if (result instanceof Response) {
      setError('Delete failed. Try again.')
      return
    }
    await router.invalidate()
  }

  async function redeliver(delivery: WebhookDeliveryRow) {
    const result = await webhookRedeliverFn({ data: { deliveryId: delivery.id } })
    if (result instanceof Response) {
      setError('Redeliver failed. Try again.')
      return
    }
    await router.invalidate()
  }

  return (
    <Stack gap={3}>
      <Heading level={1}>Webhooks</Heading>
      {plainSecret ? (
        <Card>
          <Stack gap={1}>
            <Heading level={2}>Signing secret — copy once</Heading>
            <Text type="body">{plainSecret}</Text>
            <Text type="supporting">Each delivery carries Destr-Signature: the hex HMAC-SHA256 of the body.</Text>
            <Button label="Done" onClick={() => setPlainSecret(null)} />
          </Stack>
        </Card>
      ) : null}
      {error ? <Banner status="error" title={error} /> : null}
      <Card>
        <Stack gap={2}>
          <Heading level={2}>New endpoint</Heading>
          <FormLayout>
            <TextInput label="URL" value={url} onChange={setUrl} isRequired placeholder="https://example.com/destr-hook" />
            {webhookEventTypes.map((type) => (
              <Switch
                key={type}
                label={type}
                value={events.includes(type)}
                onChange={(enabled) => toggleEvent(type, enabled)}
              />
            ))}
          </FormLayout>
          <Button label={isSaving ? 'Adding…' : 'Add endpoint'} variant="primary" onClick={() => void create()} isDisabled={isSaving} />
        </Stack>
      </Card>
      <Heading level={2}>Endpoints</Heading>
      <Table
        data={endpoints}
        idKey="id"
        columns={[
          { key: 'url', header: 'URL' },
          {
            key: 'eventTypes',
            header: 'Events',
            renderCell: (row: WebhookEndpointRow) => row.eventTypes.join(', '),
          },
          {
            key: 'isActive',
            header: 'Status',
            renderCell: (row: WebhookEndpointRow) =>
              row.isActive ? <Badge label="Active" variant="info" /> : <Badge label="Paused" variant="neutral" />,
          },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (row: WebhookEndpointRow) => (
              <Stack direction="horizontal" gap={1}>
                <Button label={row.isActive ? 'Pause' : 'Resume'} size="sm" onClick={() => void toggle(row)} />
                <Button label="Delete" size="sm" onClick={() => void remove(row)} />
              </Stack>
            ),
          },
        ]}
      />
      <Heading level={2}>Deliveries</Heading>
      <Table
        data={deliveries}
        idKey="id"
        columns={[
          { key: 'status', header: 'Status', renderCell: (row: WebhookDeliveryRow) => row.status },
          { key: 'attempts', header: 'Attempts' },
          {
            key: 'lastStatusCode',
            header: 'Last code',
            renderCell: (row: WebhookDeliveryRow) => (row.lastStatusCode === null ? '—' : String(row.lastStatusCode)),
          },
          {
            key: 'lastError',
            header: 'Last error',
            renderCell: (row: WebhookDeliveryRow) => row.lastError ?? '—',
          },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (row: WebhookDeliveryRow) =>
              row.status === 'dead' ? (
                <Button label="Redeliver" size="sm" onClick={() => void redeliver(row)} />
              ) : null,
          },
        ]}
      />
    </Stack>
  )
}
