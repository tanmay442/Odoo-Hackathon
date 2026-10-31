import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { Card } from '@astryxdesign/core/Card'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import { adminAccessFn } from '#/features/users/functions'
import { customerSchema } from '#/features/customers/schema'
import { productSchema } from '#/features/products/schema'
import { planSchema } from '#/features/plans/schema'
import { subscriptionCreateSchema, subscriptionTransitionSchema } from '#/features/subscriptions/schema'
import { invoiceCancelSchema, invoiceListSchema } from '#/features/invoices/schema'
import { claimPaymentSchema, decidePaymentSchema } from '#/features/payments/schema'

export const Route = createFileRoute('/admin/api')({
  loader: async () => {
    const access = await adminAccessFn()
    if (access instanceof Response) {
      if (access.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return null
  },
  component: ApiDocsPage,
})

interface EndpointRow extends Record<string, unknown> {
  method: string
  path: string
  scope: string
  body: string
}

const endpoints: EndpointRow[] = [
  { method: 'GET', path: '/api/v1/customers', scope: 'read', body: 'query: search, page, pageSize' },
  { method: 'POST', path: '/api/v1/customers', scope: 'write', body: 'customerSchema' },
  { method: 'GET', path: '/api/v1/customers/:id', scope: 'read', body: '—' },
  { method: 'PATCH', path: '/api/v1/customers/:id', scope: 'write', body: 'customerSchema' },
  { method: 'GET', path: '/api/v1/products', scope: 'read', body: '—' },
  { method: 'POST', path: '/api/v1/products', scope: 'write', body: 'productSchema' },
  { method: 'GET', path: '/api/v1/products/:id', scope: 'read', body: '—' },
  { method: 'GET', path: '/api/v1/plans', scope: 'read', body: '—' },
  { method: 'POST', path: '/api/v1/plans', scope: 'write', body: 'planSchema' },
  { method: 'GET', path: '/api/v1/plans/:id', scope: 'read', body: '—' },
  { method: 'GET', path: '/api/v1/subscriptions', scope: 'read', body: 'query: status, customerId, page, pageSize' },
  { method: 'POST', path: '/api/v1/subscriptions', scope: 'write', body: 'subscriptionCreateSchema' },
  { method: 'GET', path: '/api/v1/subscriptions/:id', scope: 'read', body: '—' },
  { method: 'POST', path: '/api/v1/subscriptions/:id/transition', scope: 'write', body: 'subscriptionTransitionSchema' },
  { method: 'GET', path: '/api/v1/invoices', scope: 'read', body: 'invoiceListSchema' },
  { method: 'GET', path: '/api/v1/invoices/:id', scope: 'read', body: '—' },
  { method: 'POST', path: '/api/v1/invoices/:id/confirm', scope: 'write', body: '—' },
  { method: 'POST', path: '/api/v1/invoices/:id/cancel', scope: 'write', body: 'invoiceCancelSchema' },
  { method: 'POST', path: '/api/v1/invoices/:id/send', scope: 'write', body: '—' },
  { method: 'GET', path: '/api/v1/payments', scope: 'read', body: 'query: invoiceId, status, page, pageSize' },
  { method: 'POST', path: '/api/v1/payments', scope: 'write', body: 'claimPaymentSchema' },
  { method: 'GET', path: '/api/v1/payments/:id', scope: 'read', body: '—' },
  { method: 'POST', path: '/api/v1/payments/:id/verify', scope: 'payments:verify', body: 'decidePaymentSchema' },
]

function schemaJson(schema: z.ZodType): string {
  return JSON.stringify(z.toJSONSchema(schema), null, 2)
}

const shapes: Array<{ name: string; json: string }> = [
  { name: 'customerSchema', json: schemaJson(customerSchema) },
  { name: 'productSchema', json: schemaJson(productSchema) },
  { name: 'planSchema', json: schemaJson(planSchema) },
  { name: 'subscriptionCreateSchema', json: schemaJson(subscriptionCreateSchema) },
  { name: 'subscriptionTransitionSchema', json: schemaJson(subscriptionTransitionSchema) },
  { name: 'invoiceListSchema', json: schemaJson(invoiceListSchema) },
  { name: 'invoiceCancelSchema', json: schemaJson(invoiceCancelSchema) },
  { name: 'claimPaymentSchema', json: schemaJson(claimPaymentSchema) },
  { name: 'decidePaymentSchema', json: schemaJson(decidePaymentSchema) },
]

function ApiDocsPage() {
  return (
    <Stack gap={3}>
      <Heading level={1}>API reference</Heading>
      <Text type="supporting">
        Auth: Bearer destr_live_* or x-api-key. Writes accept Idempotency-Key. Errors always look like
        {' { error: { code, message, details? } }'}. Outbound webhooks sign the raw JSON body with hex
        HMAC-SHA256 in Destr-Signature.
      </Text>
      <Table
        data={endpoints}
        idKey="path"
        columns={[
          { key: 'method', header: 'Method' },
          { key: 'path', header: 'Path' },
          { key: 'scope', header: 'Scope' },
          { key: 'body', header: 'Body' },
        ]}
      />
      {shapes.map((shape) => (
        <Card key={shape.name}>
          <Stack gap={1}>
            <Heading level={2}>{shape.name}</Heading>
            <CodeBlock code={shape.json} language="json" isWrapped hasCopyButton={false} />
          </Stack>
        </Card>
      ))}
    </Stack>
  )
}
