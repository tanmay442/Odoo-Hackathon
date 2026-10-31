import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'

import type { DiscountRow } from '#/db/schema/discounts'
import { formatMoney } from '#/domain/money'
import { DiscountForm } from '#/features/discounts/components/DiscountForm'
import { discountDeleteFn, discountGetFn, discountListFn } from '#/features/discounts/functions'
import { productListFn } from '#/features/products/functions'

type DiscountListRow = DiscountRow & { productIds: string[] }

function formatDiscountValue(row: DiscountRow): string {
  if (row.kind === 'percentage') return `${row.valueMinorOrBasisPoints / 100}%`
  return formatMoney(row.valueMinorOrBasisPoints, 'INR')
}

export const Route = createFileRoute('/admin/discounts')({
  loader: async () => {
    const [rows, products] = await Promise.all([discountListFn(), productListFn()])
    for (const result of [rows, products]) {
      if (result instanceof Response) {
        if (result.status === 401) throw redirect({ to: '/sign-in' })
        throw new Error('FORBIDDEN')
      }
    }
    return {
      rows: rows as Exclude<typeof rows, Response>,
      products: products as Exclude<typeof products, Response>,
    }
  },
  component: DiscountsPage,
})

function DiscountsPage() {
  const { rows, products } = Route.useLoaderData()
  const router = useRouter()
  const [editing, setEditing] = useState<DiscountListRow | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function edit(row: DiscountRow) {
    setError(null)
    setIsCreating(false)
    const detail = await discountGetFn({ data: { id: row.id } })
    if (detail instanceof Response || !detail) {
      setError('Loading failed. Try again.')
      return
    }
    setEditing(detail)
  }

  async function remove(row: DiscountRow) {
    setError(null)
    const result = await discountDeleteFn({ data: { id: row.id } })
    if (result instanceof Response) {
      setError('Delete failed. Used or attached rules deactivate instead; try again.')
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
        <Heading level={1}>Discounts</Heading>
        <Button
          label="New discount"
          variant="primary"
          onClick={() => {
            setEditing(null)
            setIsCreating(true)
          }}
        />
      </Stack>
      {error ? <Banner status="error" title={error} /> : null}
      <Table
        data={rows}
        idKey="id"
        columns={[
          { key: 'name', header: 'Name' },
          {
            key: 'kind',
            header: 'Value',
            renderCell: (row: DiscountRow) => formatDiscountValue(row),
          },
          { key: 'scope', header: 'Scope' },
          {
            key: 'isActive',
            header: 'Status',
            renderCell: (row: DiscountRow) =>
              row.isActive ? (
                <Badge label="Active" variant="info" />
              ) : (
                <Badge label="Inactive" variant="neutral" />
              ),
          },
          {
            key: 'timesRedeemed',
            header: 'Used',
            renderCell: (row: DiscountRow) =>
              row.maxRedemptions === null ? (
                `${row.timesRedeemed}`
              ) : (
                <Text>{`${row.timesRedeemed} / ${row.maxRedemptions}`}</Text>
              ),
          },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (row: DiscountRow) => (
              <Stack direction="horizontal" gap={1}>
                <Button label="Edit" size="sm" onClick={() => void edit(row)} />
                <Button label="Delete" size="sm" onClick={() => void remove(row)} />
              </Stack>
            ),
          },
        ]}
      />
      {isCreating || editing ? (
        <DiscountForm
          key={editing?.id ?? 'new'}
          initial={editing}
          products={products.map((product) => ({ id: product.id, name: product.name }))}
          onSaved={() => void saved()}
        />
      ) : null}
    </Stack>
  )
}
