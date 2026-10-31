import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'

import type { ProductRow } from '#/db/schema/products'
import { formatMoney } from '#/domain/money'
import { ProductForm } from '#/features/products/components/ProductForm'
import { VariantEditor } from '#/features/products/components/VariantEditor'
import { productDeleteFn, productListFn, productRestoreFn } from '#/features/products/functions'

export const Route = createFileRoute('/admin/products')({
  loader: async () => {
    const rows = await productListFn()
    if (rows instanceof Response) {
      if (rows.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return rows
  },
  component: ProductsPage,
})

function ProductsPage() {
  const rows = Route.useLoaderData()
  const router = useRouter()
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = rows.find((row) => row.id === selectedId) ?? null

  async function remove(row: ProductRow) {
    setError(null)
    const result = await productDeleteFn({ data: { id: row.id } })
    if (result instanceof Response) {
      setError('Delete failed. Referenced products archive instead; try again.')
      return
    }
    if (selectedId === row.id) setSelectedId(null)
    await router.invalidate()
  }

  async function restore(row: ProductRow) {
    setError(null)
    const result = await productRestoreFn({ data: { id: row.id } })
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
        <Heading level={1}>Products</Heading>
        <Button
          label="New product"
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
          { key: 'type', header: 'Type' },
          {
            key: 'salesPriceMinor',
            header: 'Sales price',
            renderCell: (row: ProductRow) => formatMoney(row.salesPriceMinor, row.currency),
          },
          {
            key: 'status',
            header: 'Status',
            renderCell: (row: ProductRow) =>
              row.archivedAt ? <Badge label="Archived" variant="neutral" /> : <Badge label="Live" variant="info" />,
          },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (row: ProductRow) => (
              <Stack direction="horizontal" gap={1}>
                <Button label="Edit" size="sm" onClick={() => {
                  setIsCreating(false)
                  setEditing(row)
                }} />
                <Button label="Variants" size="sm" onClick={() => setSelectedId(row.id)} />
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
        <ProductForm
          key={editing?.id ?? 'new'}
          initial={editing}
          onSaved={() => void saved()}
        />
      ) : null}
      {selected ? <VariantEditor key={selected.id} product={selected} /> : null}
    </Stack>
  )
}
