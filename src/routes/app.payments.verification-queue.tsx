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
import { TextArea } from '@astryxdesign/core/TextArea'

import { formatMoney } from '#/domain/money'
import { paymentDecideFn, paymentQueueFn } from '#/features/payments/functions'
import type { VerificationQueueEntry } from '#/features/payments/queries'

export const Route = createFileRoute('/app/payments/verification-queue')({
  loader: async () => {
    const queue = await paymentQueueFn({ data: {} })
    if (queue instanceof Response) {
      if (queue.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return queue
  },
  component: VerificationQueuePage,
})

function VerificationQueuePage() {
  const queue = Route.useLoaderData()
  const router = useRouter()
  const [rejecting, setRejecting] = useState<VerificationQueueEntry | null>(
    null,
  )
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function verify(entry: VerificationQueueEntry) {
    setError(null)
    const result = await paymentDecideFn({
      data: { paymentId: entry.paymentId, approved: true, reason: '' },
    })
    if (result instanceof Response) {
      setError('Verification failed. Try again.')
      return
    }
    await router.invalidate()
  }

  async function reject() {
    if (!rejecting) return
    if (reason.trim() === '') {
      setError('A reason is required to reject a payment.')
      return
    }
    setError(null)
    const result = await paymentDecideFn({
      data: {
        paymentId: rejecting.paymentId,
        approved: false,
        reason: reason.trim(),
      },
    })
    if (result instanceof Response) {
      setError('Rejection failed. Try again.')
      return
    }
    setRejecting(null)
    setReason('')
    await router.invalidate()
  }

  return (
    <Stack gap={3}>
      <Heading level={1}>Verification queue</Heading>
      <Text type="supporting">{`${queue.total} claims awaiting verification`}</Text>
      {error ? <Banner status="error" title={error} /> : null}
      <Table
        data={queue.rows}
        idKey="paymentId"
        columns={[
          { key: 'invoiceNumber', header: 'Invoice' },
          { key: 'customerName', header: 'Customer' },
          {
            key: 'amountMinor',
            header: 'Amount',
            renderCell: (row: VerificationQueueEntry) =>
              formatMoney(row.amountMinor, row.currency),
          },
          { key: 'method', header: 'Method' },
          { key: 'paidOn', header: 'Paid on' },
          { key: 'note', header: 'Reference' },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (row: VerificationQueueEntry) => (
              <Stack direction="horizontal" gap={1}>
                <Button
                  label="Verify"
                  size="sm"
                  variant="primary"
                  onClick={() => void verify(row)}
                />
                <Button
                  label="Reject"
                  size="sm"
                  onClick={() => void (setRejecting(row), setReason(''))}
                />
              </Stack>
            ),
          },
        ]}
      />
      {rejecting ? (
        <Card>
          <Stack gap={2}>
            <Heading
              level={3}
            >{`Reject ${rejecting.invoiceNumber} — ${formatMoney(rejecting.amountMinor, rejecting.currency)}`}</Heading>
            <Badge label="The customer sees this reason" variant="warning" />
            <TextArea
              label="Rejection reason (required)"
              value={reason}
              onChange={setReason}
              rows={3}
              placeholder="Why is this claim rejected?"
            />
            <Stack direction="horizontal" gap={2}>
              <Button
                label="Confirm reject"
                variant="primary"
                onClick={() => void reject()}
              />
              <Button
                label="Back"
                onClick={() => void (setRejecting(null), setReason(''))}
              />
            </Stack>
          </Stack>
        </Card>
      ) : null}
    </Stack>
  )
}
