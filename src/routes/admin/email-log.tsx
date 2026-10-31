import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'

import type { EmailJobRow } from '#/db/schema/email-jobs'
import { emailLogFn, emailRetryFn } from '#/features/email/functions'

export const Route = createFileRoute('/admin/email-log')({
  loader: async () => {
    const rows = await emailLogFn({ data: { limit: 100 } })
    if (rows instanceof Response) {
      if (rows.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return rows
  },
  component: EmailLogPage,
})

function EmailLogPage() {
  const rows = Route.useLoaderData()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function retry(row: EmailJobRow) {
    setError(null)
    const result = await emailRetryFn({ data: { id: row.id } })
    if (result instanceof Response) {
      setError('Retry failed. Try again.')
      return
    }
    await router.invalidate()
  }

  return (
    <Stack gap={3}>
      <Heading level={1}>Email log</Heading>
      {error ? <Banner status="error" title={error} /> : null}
      <Table
        data={rows}
        idKey="id"
        columns={[
          { key: 'template', header: 'Template' },
          { key: 'recipient', header: 'To' },
          {
            key: 'status',
            header: 'Status',
            renderCell: (row: EmailJobRow) =>
              row.status === 'sent' ? (
                <Badge label="Sent" variant="info" />
              ) : row.status === 'failed' ? (
                <Badge label="Failed" variant="error" />
              ) : (
                <Badge label="Queued" variant="neutral" />
              ),
          },
          { key: 'attempts', header: 'Attempts' },
          {
            key: 'lastError',
            header: 'Last error',
            renderCell: (row: EmailJobRow) => row.lastError ?? '—',
          },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (row: EmailJobRow) =>
              row.status === 'failed' ? (
                <Button label="Retry" size="sm" onClick={() => void retry(row)} />
              ) : null,
          },
        ]}
      />
    </Stack>
  )
}
