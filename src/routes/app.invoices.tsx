import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Selector } from '@astryxdesign/core/Selector'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'

import type { InvoiceStatus } from '#/db/schema/invoices'
import { formatMoney } from '#/domain/money'
import { customerListFn } from '#/features/customers/functions'
import { invoiceListFn } from '#/features/invoices/functions'

const statuses: InvoiceStatus[] = ['draft', 'confirmed', 'paid', 'cancelled']

export const Route = createFileRoute('/app/invoices')({
  loader: async () => {
    const [result, customers] = await Promise.all([
      invoiceListFn({ data: {} }),
      customerListFn({ data: { pageSize: 100 } }),
    ])
    if (result instanceof Response) {
      if (result.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    if (customers instanceof Response) throw new Error('FORBIDDEN')
    return { initial: result, customers: customers.rows }
  },
  component: InvoicesPage,
})

function statusVariant(status: InvoiceStatus) {
  if (status === 'paid') return 'success' as const
  if (status === 'cancelled') return 'neutral' as const
  if (status === 'confirmed') return 'info' as const
  return 'warning' as const
}

function InvoicesPage() {
  const { initial, customers } = Route.useLoaderData()
  const router = useRouter()
  const [status, setStatus] = useState<InvoiceStatus | ''>('')
  const [customerId, setCustomerId] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState(initial)
  const [error, setError] = useState<string | null>(null)

  async function reload(next: {
    status?: InvoiceStatus | ''
    customerId?: string
    overdueOnly?: boolean
    from?: string
    to?: string
  }) {
    const current = {
      status: next.status ?? status,
      customerId: next.customerId ?? customerId,
      overdueOnly: next.overdueOnly ?? overdueOnly,
      from: next.from ?? from,
      to: next.to ?? to,
    }
    const result = await invoiceListFn({
      data: {
        status: current.status ? current.status : undefined,
        customerId: current.customerId ? current.customerId : undefined,
        overdueOnly: current.overdueOnly || undefined,
        from: current.from ? current.from : undefined,
        to: current.to ? current.to : undefined,
      },
    })
    if (result instanceof Response) {
      setError('Loading failed. Try again.')
      return
    }
    setData(result)
  }

  return (
    <Stack gap={3}>
      <Stack direction="horizontal" gap={2}>
        <Heading level={1}>Invoices</Heading>
        <Button
          label={overdueOnly ? 'Show all' : 'Overdue only'}
          size="sm"
          onClick={() =>
            void (setOverdueOnly(!overdueOnly),
            reload({ overdueOnly: !overdueOnly }))
          }
        />
        <Button
          label="Verification queue"
          size="sm"
          onClick={() =>
            void router.navigate({ to: '/app/payments/verification-queue' })
          }
        />
      </Stack>
      {error ? <Banner status="error" title={error} /> : null}
      <Stack direction="horizontal" gap={2}>
        <Selector
          label="Status filter"
          options={statuses.map((value) => ({ value, label: value }))}
          value={status === '' ? null : status}
          onChange={(value) =>
            void (setStatus((value as InvoiceStatus | null) ?? ''),
            reload({ status: (value as InvoiceStatus | null) ?? '' }))
          }
          hasClear
          isOptional
          placeholder="All statuses"
        />
        <Selector
          label="Customer filter"
          options={customers.map((customer) => ({
            value: customer.id,
            label: customer.displayName,
          }))}
          value={customerId === '' ? null : customerId}
          onChange={(value) =>
            void (setCustomerId(value ?? ''),
            reload({ customerId: value ?? '' }))
          }
          hasClear
          isOptional
          placeholder="All customers"
        />
        <TextInput
          label="From (YYYY-MM-DD)"
          value={from}
          onChange={(value) => void (setFrom(value), reload({ from: value }))}
          placeholder="2026-01-01"
          hasClear
        />
        <TextInput
          label="To (YYYY-MM-DD)"
          value={to}
          onChange={(value) => void (setTo(value), reload({ to: value }))}
          placeholder="2026-12-31"
          hasClear
        />
      </Stack>
      <Table
        data={data.rows}
        idKey="id"
        columns={[
          { key: 'number', header: 'Number' },
          {
            key: 'status',
            header: 'Status',
            renderCell: (row: (typeof data.rows)[number]) => (
              <Badge label={row.status} variant={statusVariant(row.status)} />
            ),
          },
          {
            key: 'totalMinor',
            header: 'Total',
            renderCell: (row: (typeof data.rows)[number]) =>
              formatMoney(row.totalMinor, 'INR'),
          },
          {
            key: 'dueDate',
            header: 'Due',
            renderCell: (row: (typeof data.rows)[number]) =>
              new Date(row.dueDate).toLocaleDateString('en-IN'),
          },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (row: (typeof data.rows)[number]) => (
              <Button
                label="Open"
                size="sm"
                onClick={() =>
                  void router.navigate({
                    to: '/app/invoices/$invoiceId',
                    params: { invoiceId: row.id },
                  })
                }
              />
            ),
          },
        ]}
      />
      <Text type="supporting">{`${data.total} invoices`}</Text>
    </Stack>
  )
}
