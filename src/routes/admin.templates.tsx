import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'

import type { QuotationTemplateRow } from '#/db/schema/templates'
import { planListFn } from '#/features/plans/functions'
import { productPickerFn } from '#/features/products/functions'
import { taxPickerFn } from '#/features/taxes/functions'
import { templateDeleteFn, templateGetFn, templateListFn } from '#/features/templates/functions'
import { TemplateForm } from '#/features/templates/components/TemplateForm'
import type { EditableLine } from '#/features/subscriptions/components/SubscriptionLineEditor'

export const Route = createFileRoute('/admin/templates')({
  loader: async () => {
    const [templates, plans, products, taxes] = await Promise.all([
      templateListFn(),
      planListFn(),
      productPickerFn(),
      taxPickerFn(),
    ])
    for (const result of [templates, plans, products, taxes]) {
      if (result instanceof Response) {
        if ((result).status === 401) throw redirect({ to: '/sign-in' })
        throw new Error('FORBIDDEN')
      }
    }
    return {
      templates: templates as Exclude<typeof templates, Response>,
      plans: plans as Exclude<typeof plans, Response>,
      products: products as Exclude<typeof products, Response>,
      taxes: taxes as Exclude<typeof taxes, Response>,
    }
  },
  component: TemplatesPage,
})

type TemplateWithLines = QuotationTemplateRow & { lines: EditableLine[] }

function TemplatesPage() {
  const { templates, plans, products, taxes } = Route.useLoaderData()
  const router = useRouter()
  const [editing, setEditing] = useState<TemplateWithLines | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function edit(row: QuotationTemplateRow) {
    setError(null)
    const detail = await templateGetFn({ data: { id: row.id } })
    if (detail instanceof Response) {
      setError('Loading failed. Try again.')
      return
    }
    if (!detail) {
      setError('Template not found.')
      return
    }
    setIsCreating(false)
    setEditing({ ...detail, lines: detail.lines.map((line) => ({ ...line, description: '' })) })
  }

  async function remove(row: QuotationTemplateRow) {
    setError(null)
    const result = await templateDeleteFn({ data: { id: row.id } })
    if (result instanceof Response) {
      setError('Delete failed. Try again.')
      return
    }
    await router.invalidate()
  }

  return (
    <Stack gap={3}>
      <Stack direction="horizontal" gap={2}>
        <Heading level={1}>Quotation templates</Heading>
        <Button
          label="New template"
          variant="primary"
          onClick={() => {
            setEditing(null)
            setIsCreating(true)
          }}
        />
      </Stack>
      {error ? <Banner status="error" title={error} /> : null}
      <Table
        data={templates}
        idKey="id"
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'validityDays', header: 'Valid days' },
          {
            key: 'status',
            header: 'Status',
            renderCell: (row: QuotationTemplateRow) =>
              row.isActive ? <Badge label="Live" variant="info" /> : <Badge label="Off" variant="neutral" />,
          },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (row: QuotationTemplateRow) => (
              <Stack direction="horizontal" gap={1}>
                <Button label="Edit" size="sm" onClick={() => void edit(row)} />
                <Button label="Delete" size="sm" onClick={() => void remove(row)} />
              </Stack>
            ),
          },
        ]}
      />
      {isCreating || editing ? (
        <TemplateForm
          key={editing?.id ?? 'new'}
          initial={editing}
          plans={plans.map((plan) => ({ id: plan.id, name: plan.name }))}
          products={products}
          taxes={taxes}
          onSaved={() => {
            setEditing(null)
            setIsCreating(false)
            void router.invalidate()
          }}
        />
      ) : null}
    </Stack>
  )
}
