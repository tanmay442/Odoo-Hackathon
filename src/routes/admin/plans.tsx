import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import type { PlanRow } from '#/db/schema/plans'
import { formatMoney } from '#/domain/money'
import { PlanForm } from '#/features/plans/components/PlanForm'
import { planDeleteFn, planListFn, planRestoreFn } from '#/features/plans/functions'
import { productListFn } from '#/features/products/functions'

export const Route = createFileRoute('/admin/plans')({
  loader: async () => {
    const [plans, products] = await Promise.all([planListFn(), productListFn()])
    for (const result of [plans, products]) {
      if (result instanceof Response) {
        if (result.status === 401) throw redirect({ to: '/sign-in' })
        throw new Error('FORBIDDEN')
      }
    }
    return { plans: plans as Exclude<typeof plans, Response>, products: products as Exclude<typeof products, Response> }
  },
  component: PlansPage,
})

function intervalLabel(row: PlanRow): string {
  return row.intervalCount === 1 ? row.billingInterval : `every ${row.intervalCount} ${row.billingInterval}s`
}

function PlansPage() {
  const { plans, products } = Route.useLoaderData()
  const router = useRouter()
  const [editing, setEditing] = useState<PlanRow | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove(row: PlanRow) {
    setError(null)
    const result = await planDeleteFn({ data: { id: row.id } })
    if (result instanceof Response) {
      setError('Delete failed. Try again.')
      return
    }
    await router.invalidate()
  }

  async function restore(row: PlanRow) {
    setError(null)
    const result = await planRestoreFn({ data: { id: row.id } })
    if (result instanceof Response) {
      setError('Restore failed. Try again.')
      return
    }
    await router.invalidate()
  }

  async function saved() {
    setEditing(null)
    setIsCreating(false)
    await router.invalidate()
  }

  return (
    <Stack gap={3}>
      <Stack direction="horizontal" gap={2}>
        <Heading level={1}>Plans</Heading>
        <Button
          label="New plan"
          variant="primary"
          onClick={() => {
            setEditing(null)
            setIsCreating(true)
          }}
        />
      </Stack>
      {error ? <Banner status="error" title={error} /> : null}
      <Table
        data={plans}
        idKey="id"
        columns={[
          { key: 'name', header: 'Name' },
          {
            key: 'priceMinor',
            header: 'Price',
            renderCell: (row: PlanRow) => formatMoney(row.priceMinor, row.currency),
          },
          { key: 'interval', header: 'Bills', renderCell: (row: PlanRow) => intervalLabel(row) },
          {
            key: 'priceChangedAt',
            header: 'Price change',
            renderCell: (row: PlanRow) =>
              row.priceChangedAt ? (
                <Text>Stamped {row.priceChangedAt.toLocaleDateString('en-IN')}</Text>
              ) : (
                <Text>—</Text>
              ),
          },
          {
            key: 'status',
            header: 'Status',
            renderCell: (row: PlanRow) =>
              row.archivedAt ? <Badge label="Archived" variant="neutral" /> : <Badge label="Live" variant="info" />,
          },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (row: PlanRow) => (
              <Stack direction="horizontal" gap={1}>
                <Button label="Edit" size="sm" onClick={() => {
                  setIsCreating(false)
                  setEditing(row)
                }} />
                {row.archivedAt ? (
                  <Button label="Restore" size="sm" onClick={() => void restore(row)} />
                ) : (
                  <Button label="Delete" size="sm" onClick={() => void remove(row)} />
                )}
              </Stack>
            ),
          },
        ]}
      />
      {isCreating || editing ? (
        <PlanForm
          key={editing?.id ?? 'new'}
          initial={editing}
          products={products
            .filter((product) => product.archivedAt === null)
            .map((product) => ({ id: product.id, name: product.name }))}
          onSaved={() => void saved()}
        />
      ) : null}
    </Stack>
  )
}
