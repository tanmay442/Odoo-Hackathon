import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'

import { formatMoney } from '#/domain/money'
import {
  invoiceCancelFn,
  invoiceConfirmFn,
  invoiceGetFn,
  invoiceSendFn,
} from '#/features/invoices/functions'
import { PaymentHistory } from '#/features/payments/components/PaymentHistory'
import { RecordPaymentForm } from '#/features/payments/components/RecordPaymentForm'
import { invoicePaymentsFn } from '#/features/payments/functions'
import { invoiceBalance } from '#/features/payments/queries'

export const Route = createFileRoute('/app/invoices/$invoiceId')({
  loader: async ({ params }) => {
    const [detail, paymentState] = await Promise.all([
      invoiceGetFn({ data: { id: params.invoiceId } }),
      invoicePaymentsFn({ data: { invoiceId: params.invoiceId } }),
    ])
    if (detail instanceof Response) {
      if (detail.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    if (!detail) throw new Error('NOT_FOUND')
    if (paymentState instanceof Response) throw new Error('FORBIDDEN')
    return {
      detail,
      payments: paymentState?.payments ?? [],
      events: paymentState?.events ?? [],
    }
  },
  component: InvoiceDetailPage,
})

function InvoiceDetailPage() {
  const { detail, payments, events } = Route.useLoaderData()
  const { balanceMinor, overpaidMinor } = invoiceBalance(detail)
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)

  async function confirm() {
    setError(null)
    const result = await invoiceConfirmFn({ data: { id: detail.id } })
    if (result instanceof Response) {
      setError('Confirm failed. Only draft invoices can be confirmed.')
      return
    }
    await router.invalidate()
  }

  async function cancel() {
    setError(null)
    if (!cancelReason.trim()) {
      setError('A reason is required to cancel.')
      return
    }
    const result = await invoiceCancelFn({
      data: { id: detail.id, reason: cancelReason.trim() },
    })
    if (result instanceof Response) {
      setError('Cancel failed. Paid invoices cannot be cancelled.')
      return
    }
    setIsCancelling(false)
    await router.invalidate()
  }

  async function send() {
    setError(null)
    const result = await invoiceSendFn({ data: { id: detail.id } })
    if (result instanceof Response) {
      setError('Send failed. Only confirmed invoices can be sent.')
      return
    }
    await router.invalidate()
  }

  return (
    <Stack gap={3}>
      <Stack direction="horizontal" gap={2}>
        <Heading level={1}>{detail.number}</Heading>
        <Badge label={detail.status} variant="info" />
        {detail.overdue ? <Badge label="overdue" variant="error" /> : null}
      </Stack>
      {error ? <Banner status="error" title={error} /> : null}
      <Card>
        <Stack gap={1}>
          <Text type="body">{`Period: ${new Date(detail.periodStart).toLocaleDateString('en-IN')} to ${new Date(detail.periodEnd).toLocaleDateString('en-IN')}`}</Text>
          <Text type="supporting">{`Due: ${new Date(detail.dueDate).toLocaleDateString('en-IN')} · Total: ${formatMoney(detail.totalMinor, 'INR')} · Paid: ${formatMoney(detail.amountPaidMinor, 'INR')}`}</Text>
          <Text type="supporting">{`Subtotal: ${formatMoney(detail.subtotalMinor, 'INR')} · Discount: ${formatMoney(detail.discountMinor, 'INR')} · Tax: ${formatMoney(detail.taxMinor, 'INR')}`}</Text>
        </Stack>
      </Card>
      <Stack direction="horizontal" gap={2}>
        {detail.status === 'draft' ? (
          <Button
            label="Confirm"
            variant="primary"
            onClick={() => void confirm()}
          />
        ) : null}
        {detail.status === 'draft' || detail.status === 'confirmed' ? (
          <Button label="Cancel" onClick={() => setIsCancelling(true)} />
        ) : null}
        <Button
          label="Print"
          onClick={() =>
            void router.navigate({
              to: '/app/invoices/$invoiceId/print',
              params: { invoiceId: detail.id },
            })
          }
        />
        <Button
          label="Send"
          onClick={() => void send()}
        />
      </Stack>
      {isCancelling ? (
        <Card>
          <Stack gap={2}>
            <TextInput
              label="Cancel reason (required)"
              value={cancelReason}
              onChange={setCancelReason}
              placeholder="Why is this invoice cancelled?"
              hasClear
            />
            <Stack direction="horizontal" gap={2}>
              <Button
                label="Confirm cancel"
                variant="primary"
                onClick={() => void cancel()}
              />
              <Button label="Back" onClick={() => setIsCancelling(false)} />
            </Stack>
          </Stack>
        </Card>
      ) : null}
      <Heading level={2}>Lines</Heading>
      <Table
        data={detail.lines}
        idKey="id"
        columns={[
          { key: 'description', header: 'Description' },
          { key: 'quantity', header: 'Qty' },
          {
            key: 'unitPriceMinor',
            header: 'Unit price',
            renderCell: (row: (typeof detail.lines)[number]) =>
              formatMoney(row.unitPriceMinor, 'INR'),
          },
          {
            key: 'amountMinor',
            header: 'Amount',
            renderCell: (row: (typeof detail.lines)[number]) =>
              formatMoney(row.amountMinor, 'INR'),
          },
        ]}
      />
      <Heading level={2}>Tax summary</Heading>
      <Table
        data={detail.taxes}
        idKey="taxId"
        columns={[
          { key: 'taxId', header: 'Tax' },
          { key: 'rateBasisPoints', header: 'Rate (bps)' },
          {
            key: 'taxableAmountMinor',
            header: 'Taxable',
            renderCell: (row: (typeof detail.taxes)[number]) =>
              formatMoney(row.taxableAmountMinor, 'INR'),
          },
          {
            key: 'taxAmountMinor',
            header: 'Tax',
            renderCell: (row: (typeof detail.taxes)[number]) =>
              formatMoney(row.taxAmountMinor, 'INR'),
          },
        ]}
      />
      <Heading level={2}>Discounts</Heading>
      <Table
        data={detail.discounts}
        idKey="discountId"
        columns={[
          { key: 'name', header: 'Discount' },
          {
            key: 'amountMinor',
            header: 'Amount',
            renderCell: (row: (typeof detail.discounts)[number]) =>
              formatMoney(row.amountMinor, 'INR'),
          },
          {
            key: 'discardedAmountMinor',
            header: 'Discarded',
            renderCell: (row: (typeof detail.discounts)[number]) =>
              formatMoney(row.discardedAmountMinor, 'INR'),
          },
        ]}
      />
      <Heading level={2}>Payments</Heading>
      <Text type="supporting">{`Balance due: ${formatMoney(balanceMinor, 'INR')}${overpaidMinor > 0 ? ` · Overpaid: ${formatMoney(overpaidMinor, 'INR')}` : ''}`}</Text>
      {detail.status === 'confirmed' || detail.status === 'paid' ? (
        <RecordPaymentForm
          key={`${detail.id}-${detail.amountPaidMinor}`}
          invoiceId={detail.id}
          balanceMinor={balanceMinor}
          currency="INR"
          onRecorded={() => void router.invalidate()}
        />
      ) : null}
      <PaymentHistory payments={payments} events={events} currency="INR" />
    </Stack>
  )
}
