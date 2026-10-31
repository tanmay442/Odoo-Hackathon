import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { Selector } from '@astryxdesign/core/Selector'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'

import { formatMoney } from '#/domain/money'
import { MoneyField } from '#/features/shared/money-field'
import { paymentClaimFn } from '#/features/payments/functions'
import { paymentMethods } from '#/features/payments/schema'
import type { PaymentMethod } from '#/features/payments/schema'

export function PaymentClaimForm({
  invoiceId,
  balanceMinor,
  currency,
  onSubmitted,
}: {
  invoiceId: string
  balanceMinor: number
  currency: string
  onSubmitted: () => void
}) {
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer')
  const [amountMinor, setAmountMinor] = useState<number | null>(balanceMinor)
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function submit() {
    if (amountMinor === null || amountMinor < 1) {
      setError('Enter an amount of at least ₹0.01.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      setError('Use YYYY-MM-DD for the payment date.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const result = await paymentClaimFn({
        data: {
          invoiceId,
          method,
          amountMinor,
          currency,
          paidOn,
          note: note.trim(),
        },
      })
      if (result instanceof Response) {
        const body = (await result.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? 'Submitting failed.')
      }
      onSubmitted()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Submitting failed. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <Stack gap={2}>
        <Heading level={3}>Submit payment</Heading>
        <Text type="supporting">{`Balance due: ${formatMoney(balanceMinor, currency)}`}</Text>
        {error ? <Banner status="error" title={error} /> : null}
        <FormLayout>
          <Selector
            label="Method"
            options={paymentMethods.map((value) => ({ value, label: value.replace('_', ' ') }))}
            value={method}
            onChange={(value) => setMethod(value as PaymentMethod)}
            isRequired
            placeholder="Choose a method"
          />
          <MoneyField label="Amount" valueMinor={amountMinor} currency={currency} onChange={setAmountMinor} />
          <TextInput
            label="Paid on (YYYY-MM-DD)"
            value={paidOn}
            onChange={setPaidOn}
            isRequired
            placeholder="2026-10-31"
            hasClear
          />
          <TextArea
            label="Reference"
            value={note}
            onChange={setNote}
            isOptional
            rows={2}
            placeholder="Bank reference, cheque number, UPI id"
          />
        </FormLayout>
        <Button
          label="Submit for verification"
          variant="primary"
          isLoading={isSaving}
          onClick={() => void submit()}
        />
      </Stack>
    </Card>
  )
}
