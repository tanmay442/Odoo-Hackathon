import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'

import type { TaxRow } from '#/db/schema/taxes'
import { TaxForm } from '#/features/taxes/components/TaxForm'
import { taxDeleteFn, taxListFn, taxRestoreFn } from '#/features/taxes/functions'

export const Route = createFileRoute('/admin/taxes')({
  loader: async () => {
    const rows = await taxListFn()
    if (rows instanceof Response) {
      if (rows.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return rows
  },
  component: TaxesPage,
})

function TaxesPage() {
  const rows = Route.useLoaderData()
  const router = useRouter()
  const [editing, setEditing] = useState<TaxRow | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove(row: TaxRow) {
    setError(null)
    const result = await taxDeleteFn({ data: { id: row.id } })
    if (result instanceof Response) {
      setError('Delete failed. Try again.')
      return
    }
    await router.invalidate()
  }

  async function restore(row: TaxRow) {
    setError(null)
    const result = await taxRestoreFn({ data: { id: row.id } })
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
        <Heading level={1}>Taxes</Heading>
        <Button
          label="New tax"
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
            key: 'rateBasisPoints',
            header: 'Rate',
            renderCell: (row: TaxRow) => `${row.rateBasisPoints / 100}%`,
          },
          {
            key: 'isActive',
            header: 'Status',
            renderCell: (row: TaxRow) =>
              row.isActive ? <Badge label="Active" variant="info" /> : <Badge label="Inactive" variant="neutral" />,
          },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (row: TaxRow) => (
              <Stack direction="horizontal" gap={1}>
                <Button label="Edit" size="sm" onClick={() => {
                  setIsCreating(false)
                  setEditing(row)
                }} />
                {row.isActive ? (
                  <Button label="Delete" size="sm" onClick={() => void remove(row)} />
                ) : (
                  <Button label="Restore" size="sm" onClick={() => void restore(row)} />
                )}
              </Stack>
            ),
          },
        ]}
      />
      {isCreating || editing ? (
        <TaxForm
          key={editing?.id ?? 'new'}
          initial={editing}
          onSaved={() => void saved()}
        />
      ) : null}
    </Stack>
  )
}
