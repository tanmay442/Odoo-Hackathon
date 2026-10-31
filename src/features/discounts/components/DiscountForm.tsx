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

import type { DiscountRow } from '#/db/schema/discounts'
import { MoneyField } from '#/features/shared/money-field'

import { discountCreateFn, discountUpdateFn } from '../functions'
import type { DiscountKindInput, DiscountScopeInput } from '../schema'
import { describeDiscountRule } from '../summary'

type IsoDay = `${number}${number}${number}${number}-${number}${number}-${number}${number}`

function toIsoDay(value: Date | null): IsoDay | undefined {
  return value ? (value.toISOString().slice(0, 10) as IsoDay) : undefined
}

interface DiscountFormProps {
  initial: (DiscountRow & { productIds: string[] }) | null
  products: Array<{ id: string; name: string }>
  onSaved: () => void
}

export function DiscountForm({ initial, products, onSaved }: DiscountFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<DiscountKindInput>(initial?.kind ?? 'percentage')
  const [valueMinorOrBasisPoints, setValueMinorOrBasisPoints] = useState<number>(
    initial?.valueMinorOrBasisPoints ?? 1000,
  )
  const [scope, setScope] = useState<DiscountScopeInput>(initial?.scope ?? 'subscription')
  const [productIds, setProductIds] = useState<string[]>(initial?.productIds ?? [])
  const [minPurchaseMinor, setMinPurchaseMinor] = useState<number | null>(
    initial?.minPurchaseMinor ?? null,
  )
  const [minQuantity, setMinQuantity] = useState<number | null>(initial?.minQuantity ?? null)
  const [startsAt, setStartsAt] = useState<IsoDay | undefined>(toIsoDay(initial?.startsAt ?? null))
  const [endsAt, setEndsAt] = useState<IsoDay | undefined>(toIsoDay(initial?.endsAt ?? null))
  const [maxRedemptions, setMaxRedemptions] = useState<number | null>(
    initial?.maxRedemptions ?? null,
  )
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [productPick, setProductPick] = useState<string | null>(null)
  const windowInvalid = startsAt !== undefined && endsAt !== undefined && startsAt > endsAt
  const summary = describeDiscountRule({
    kind,
    valueMinorOrBasisPoints,
    scope,
    minPurchaseMinor,
    minQuantity,
    startsAt: startsAt ?? null,
    endsAt: endsAt ?? null,
    maxRedemptions,
    timesRedeemed: initial?.timesRedeemed ?? 0,
    isActive,
    productCount: productIds.length,
  })

  function addProduct() {
    if (productPick && !productIds.includes(productPick)) {
      setProductIds([...productIds, productPick])
    }
    setProductPick(null)
  }

  function removeProduct(productId: string) {
    setProductIds(productIds.filter((candidate) => candidate !== productId))
  }

  async function save() {
    if (scope === 'product' && productIds.length === 0) {
      setError('Pick at least one product for a product discount.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const payload = {
        name: name.trim(),
        kind,
        valueMinorOrBasisPoints,
        scope,
        productIds,
        minPurchaseMinor,
        minQuantity,
        startsAt: startsAt ?? null,
        endsAt: endsAt ?? null,
        maxRedemptions,
        isActive,
      }
      const result = initial
        ? await discountUpdateFn({ data: { ...payload, id: initial.id } })
        : await discountCreateFn({ data: payload })
      if (result instanceof Response) throw new Error('Save refused')
      onSaved()
    } catch {
      setError('Saving failed. Check the fields and try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Stack gap={2}>
      <Card>
        <Stack gap={2}>
          <Heading level={2}>{initial ? 'Edit discount' : 'New discount'}</Heading>
          {error ? <Banner status="error" title={error} /> : null}
          <FormLayout>
            <TextInput label="Name" value={name} onChange={setName} isRequired placeholder="Volume discount" />
            <Selector
              label="Kind"
              options={[
                { value: 'percentage', label: '% Percentage' },
                { value: 'fixed', label: '₹ Fixed' },
              ]}
              value={kind}
              onChange={(value) => setKind(value as DiscountKindInput)}
              isRequired
            />
            {kind === 'fixed' ? (
              <MoneyField
                label="Amount"
                valueMinor={valueMinorOrBasisPoints}
                currency="INR"
                onChange={setValueMinorOrBasisPoints}
                description="Fixed paise taken off before tax; excess over the base is discarded."
              />
            ) : (
              <NumberInput
                label="Percent"
                value={valueMinorOrBasisPoints / 100}
                onChange={(percent) => setValueMinorOrBasisPoints(Math.round(percent * 100))}
                units="%"
                min={0}
                max={100}
                step={0.5}
                isRequired
                description="Stored as basis points; 10% becomes 1000."
              />
            )}
            <Selector
              label="Scope"
              options={[
                { value: 'subscription', label: 'Whole subscription' },
                { value: 'product', label: 'Specific products' },
              ]}
              value={scope}
              onChange={(value) => setScope(value as DiscountScopeInput)}
              isRequired
            />
          </FormLayout>
        </Stack>
      </Card>
      {scope === 'product' ? (
        <Card>
          <Stack gap={2}>
            <Heading level={2}>Products</Heading>
            <Stack direction="horizontal" gap={2}>
              <Selector
                label="Add product"
                options={products
                  .filter((product) => !productIds.includes(product.id))
                  .map((product) => ({ value: product.id, label: product.name }))}
                value={productPick}
                onChange={setProductPick}
                hasClear
                isOptional
                placeholder="Pick a product"
              />
              <Button label="Add" onClick={addProduct} isDisabled={productPick === null} />
            </Stack>
            {productIds.map((productId) => (
              <Stack key={productId} direction="horizontal" gap={2}>
                <Text>{products.find((product) => product.id === productId)?.name ?? productId}</Text>
                <Button label="Remove" size="sm" onClick={() => removeProduct(productId)} />
              </Stack>
            ))}
          </Stack>
        </Card>
      ) : null}
      <Card>
        <Stack gap={2}>
          <Heading level={2}>Conditions</Heading>
          <FormLayout>
            <Stack gap={1}>
              <MoneyField
                label="Minimum purchase"
                valueMinor={minPurchaseMinor}
                currency="INR"
                onChange={setMinPurchaseMinor}
                description="Optional. Exactly at the minimum passes."
              />
              {minPurchaseMinor !== null ? (
                <Button label="Clear minimum" size="sm" onClick={() => setMinPurchaseMinor(null)} />
              ) : null}
            </Stack>
            <NumberInput
              label="Minimum quantity"
              value={minQuantity}
              onChange={setMinQuantity}
              min={1}
              isIntegerOnly
              isOptional
              hasClear
              description="Optional. Exactly at the minimum passes."
            />
            <DateInput label="Starts" value={startsAt} onChange={setStartsAt} hasClear isOptional />
            <DateInput label="Ends" value={endsAt} onChange={setEndsAt} hasClear isOptional />
            <NumberInput
              label="Max redemptions"
              value={maxRedemptions}
              onChange={setMaxRedemptions}
              min={1}
              isIntegerOnly
              isOptional
              hasClear
              description="Optional cap; concurrent invoice runs share one atomic counter."
            />
            <Switch
              label="Active"
              description="Only active rules apply. Expired or exhausted rules stop on their own."
              value={isActive}
              onChange={setIsActive}
            />
          </FormLayout>
          {windowInvalid ? <Banner status="error" title="Discount ends before it starts." /> : null}
        </Stack>
      </Card>
      <Card>
        <Stack gap={1}>
          <Heading level={2}>Summary</Heading>
          <Text>{summary}</Text>
        </Stack>
      </Card>
      <Button
        label={isSaving ? 'Saving…' : initial ? 'Save changes' : 'Create discount'}
        variant="primary"
        isDisabled={name.trim() === '' || windowInvalid || isSaving}
        onClick={() => void save()}
      />
    </Stack>
  )
}
