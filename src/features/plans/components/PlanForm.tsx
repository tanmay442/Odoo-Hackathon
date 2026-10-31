import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { DateInput } from '@astryxdesign/core/DateInput'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Stack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'

import type { BillingInterval, PlanRow } from '#/db/schema/plans'
import { MoneyField } from '#/features/shared/money-field'

import { planCreateFn, planUpdateFn } from '../functions'

const intervals: BillingInterval[] = ['daily', 'weekly', 'monthly', 'yearly']

type IsoDay = `${number}${number}${number}${number}-${number}${number}-${number}${number}`

function toIsoDate(value: Date | null): IsoDay | undefined {
  return value ? (value.toISOString().slice(0, 10) as IsoDay) : undefined
}

interface PlanFormProps {
  initial: PlanRow | null
  products: Array<{ id: string; name: string }>
  onSaved: () => void
}

export function PlanForm({ initial, products, onSaved }: PlanFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [productId, setProductId] = useState<string | null>(initial?.productId ?? null)
  const [priceMinor, setPriceMinor] = useState<number | null>(initial?.priceMinor ?? null)
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    initial?.billingInterval ?? 'monthly',
  )
  const [intervalCount, setIntervalCount] = useState(initial?.intervalCount ?? 1)
  const [minQuantity, setMinQuantity] = useState(initial?.minQuantity ?? 1)
  const [availableFrom, setAvailableFrom] = useState<IsoDay | undefined>(toIsoDate(initial?.availableFrom ?? null))
  const [availableTo, setAvailableTo] = useState<IsoDay | undefined>(toIsoDate(initial?.availableTo ?? null))
  const [autoCloseAtEnd, setAutoCloseAtEnd] = useState(initial?.autoCloseAtEnd ?? false)
  const [allowEarlyClose, setAllowEarlyClose] = useState(initial?.allowEarlyClose ?? true)
  const [allowPause, setAllowPause] = useState(initial?.allowPause ?? true)
  const [allowRenew, setAllowRenew] = useState(initial?.allowRenew ?? true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const windowInvalid =
    availableFrom !== undefined && availableTo !== undefined && availableFrom > availableTo

  async function save() {
    if (priceMinor === null) {
      setError('Enter a price.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const payload = {
        name: name.trim(),
        productId: productId ?? null,
        priceMinor,
        currency: initial?.currency ?? 'INR',
        billingInterval,
        intervalCount,
        minQuantity,
        availableFrom: availableFrom ?? null,
        availableTo: availableTo ?? null,
        autoCloseAtEnd,
        allowEarlyClose,
        allowPause,
        allowRenew,
      }
      const result = initial
        ? await planUpdateFn({ data: { ...payload, id: initial.id } })
        : await planCreateFn({ data: payload })
      if (result instanceof Response) throw new Error('Save refused')
      onSaved()
    } catch {
      setError('Saving failed. Check the fields and try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Stack gap={3}>
      {error ? <Banner status="error" title={error} /> : null}
      <Card>
        <Stack gap={2}>
          <Heading level={2}>Pricing</Heading>
          <FormLayout>
            <TextInput label="Name" value={name} onChange={setName} isRequired placeholder="Monthly" />
            <Selector
              label="Product"
              options={products.map((product) => ({ value: product.id, label: product.name }))}
              value={productId}
              onChange={setProductId}
              hasClear
              isOptional
              placeholder="No product"
            />
            <MoneyField
              label="Price"
              valueMinor={priceMinor}
              currency={initial?.currency ?? 'INR'}
              onChange={setPriceMinor}
              description="Editing the price after subscriptions exist stamps the change and keeps existing subscriptions on their snapshot."
            />
            <Selector
              label="Billing interval"
              options={intervals.map((interval) => ({ value: interval, label: interval }))}
              value={billingInterval}
              onChange={(value) => setBillingInterval(value as BillingInterval)}
              isRequired
            />
            <NumberInput
              label="Interval count"
              value={intervalCount}
              onChange={setIntervalCount}
              min={1}
              isIntegerOnly
              isRequired
            />
            <NumberInput
              label="Minimum quantity"
              value={minQuantity}
              onChange={setMinQuantity}
              min={1}
              isIntegerOnly
              isRequired
            />
          </FormLayout>
        </Stack>
      </Card>
      <Card>
        <Stack gap={2}>
          <Heading level={2}>Availability</Heading>
          <Text>Plans outside their window cannot start new subscriptions. Existing ones keep billing.</Text>
          <FormLayout>
            <DateInput label="Available from" value={availableFrom} onChange={setAvailableFrom} hasClear isOptional />
            <DateInput label="Available to" value={availableTo} onChange={setAvailableTo} hasClear isOptional />
          </FormLayout>
          {windowInvalid ? <Banner status="error" title="Availability ends before it starts." /> : null}
        </Stack>
      </Card>
      <Card>
        <Stack gap={2}>
          <Heading level={2}>Lifecycle</Heading>
          <Switch
            label="Close automatically at period end"
            description="Active subscriptions close instead of renewing past the expiry date."
            value={autoCloseAtEnd}
            onChange={setAutoCloseAtEnd}
          />
          <Switch
            label="Allow early close"
            description="Staff and customers can close the subscription before its end."
            value={allowEarlyClose}
            onChange={setAllowEarlyClose}
          />
          <Switch
            label="Allow pause"
            description="Staff and customers can pause and resume the subscription."
            value={allowPause}
            onChange={setAllowPause}
          />
          <Switch
            label="Allow renew"
            description="A closed subscription can start a new period."
            value={allowRenew}
            onChange={setAllowRenew}
          />
        </Stack>
      </Card>
      <Button
        label={isSaving ? 'Saving…' : initial ? 'Save changes' : 'Create plan'}
        variant="primary"
        isDisabled={name.trim() === '' || windowInvalid || isSaving}
        onClick={() => void save()}
      />
    </Stack>
  )
}
