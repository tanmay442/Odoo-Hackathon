import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'

import type { CustomerRow } from '#/db/schema/customers'
import { customerArchiveFn, customerListFn } from '#/features/customers/functions'
import { CustomerForm } from '#/features/customers/components/CustomerForm'

export const Route = createFileRoute('/app/customers')({
  loader: async () => {
    const result = await customerListFn({ data: {} })
    if (result instanceof Response) {
      if (result.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return result
  },
  component: CustomersPage,
})

function CustomersPage() {
  const initial = Route.useLoaderData()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CustomerRow | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  async function reload(nextSearch: string, nextPage: number) {
    const result = await customerListFn({ data: { search: nextSearch || undefined, page: nextPage, pageSize: 20 } })
    if (result instanceof Response) {
      setError('Loading failed. Try again.')
      return
    }
    setData(result)
  }

  async function archive(row: CustomerRow) {
    setError(null)
    const result = await customerArchiveFn({ data: { id: row.id } })
    if (result instanceof Response) {
      setError(result.status === 409 ? 'Customers with subscriptions stay archived instead of deleted.' : 'Archive failed.')
      return
    }
    await reload(search, page)
    await router.invalidate()
  }

  async function restore(row: CustomerRow) {
    setError(null)
    const { customerRestoreFn } = await import('#/features/customers/functions')
    const result = await customerRestoreFn({ data: { id: row.id } })
    if (result instanceof Response) {
      setError('Restore failed. Try again.')
      return
    }
    await reload(search, page)
  }

  return (
    <Stack gap={3}>
      <Stack direction="horizontal" gap={2}>
        <Heading level={1}>Customers</Heading>
        <Button
          label="New customer"
          variant="primary"
          onClick={() => {
            setEditing(null)
            setIsCreating(true)
          }}
        />
      </Stack>
      {error ? <Banner status="error" title={error} /> : null}
      <TextInput label="Search" value={search} onChange={(value) => void (setSearch(value), setPage(1), reload(value, 1))} placeholder="Name or email" hasClear />
      <Table
        data={data.rows}
        idKey="id"
        rowCount={data.total}
        rowIndexStart={(data.page - 1) * data.pageSize + 1}
        columns={[
          { key: 'displayName', header: 'Name' },
          { key: 'email', header: 'Email' },
          {
            key: 'status',
            header: 'Status',
            renderCell: (row: CustomerRow) =>
              row.archivedAt ? <Badge label="Archived" variant="neutral" /> : <Badge label="Live" variant="info" />,
          },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (row: CustomerRow) => (
              <Stack direction="horizontal" gap={1}>
                <Button label="Open" size="sm" onClick={() => (window.location.href = `/app/customers/${row.id}`)} />
                <Button
                  label="Edit"
                  size="sm"
                  onClick={() => {
                    setIsCreating(false)
                    setEditing(row)
                  }}
                />
                {row.archivedAt ? (
                  <Button label="Restore" size="sm" onClick={() => void restore(row)} />
                ) : (
                  <Button label="Archive" size="sm" onClick={() => void archive(row)} />
                )}
              </Stack>
            ),
          },
        ]}
      />
      <Stack direction="horizontal" gap={2}>
        <Text type="supporting">{`Page ${data.page} of ${Math.max(1, Math.ceil(data.total / data.pageSize))} · ${data.total} customers`}</Text>
        <Button label="Previous" size="sm" onClick={() => void (setPage(page - 1), reload(search, page - 1))} isDisabled={page <= 1} />
        <Button
          label="Next"
          size="sm"
          onClick={() => void (setPage(page + 1), reload(search, page + 1))}
          isDisabled={page * data.pageSize >= data.total}
        />
      </Stack>
      {isCreating || editing ? (
        <CustomerForm
          key={editing?.id ?? 'new'}
          initial={editing}
          onSaved={() => {
            setEditing(null)
            setIsCreating(false)
            void reload(search, page)
          }}
        />
      ) : null}
    </Stack>
  )
}
