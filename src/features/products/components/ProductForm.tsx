import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'

import type { ProductRow } from '#/db/schema/products'
import { MoneyField } from '#/features/shared/money-field'

import { productCreateFn, productUpdateFn } from '../functions'

interface ProductFormProps {
  initial: ProductRow | null
  onSaved: () => void
}

export function ProductForm({ initial, onSaved }: ProductFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState(initial?.type ?? '')
  const [salesPriceMinor, setSalesPriceMinor] = useState<number | null>(initial?.salesPriceMinor ?? null)
  const [costPriceMinor, setCostPriceMinor] = useState<number | null>(initial?.costPriceMinor ?? null)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function save() {
    if (salesPriceMinor === null || costPriceMinor === null) {
      setError('Enter both a sales price and a cost price.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const payload = {
        name: name.trim(),
        type: type.trim(),
        salesPriceMinor,
        costPriceMinor,
        currency: initial?.currency ?? 'INR',
        notes: notes.trim() === '' ? null : notes.trim(),
      }
      const result = initial
        ? await productUpdateFn({ data: { ...payload, id: initial.id } })
        : await productCreateFn({ data: payload })
      if (result instanceof Response) throw new Error('Save refused')
      onSaved()
    } catch {
      setError('Saving failed. Check the fields and try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <Stack gap={2}>
        <Heading level={2}>{initial ? 'Edit product' : 'New product'}</Heading>
        {error ? <Banner status="error" title={error} /> : null}
        <FormLayout>
          <TextInput label="Name" value={name} onChange={setName} isRequired placeholder="Destr Suite" />
          <TextInput label="Type" value={type} onChange={setType} isRequired placeholder="software" />
          <MoneyField
            label="Sales price"
            valueMinor={salesPriceMinor}
            currency={initial?.currency ?? 'INR'}
            onChange={setSalesPriceMinor}
          />
          <MoneyField
            label="Cost price"
            valueMinor={costPriceMinor}
            currency={initial?.currency ?? 'INR'}
            onChange={setCostPriceMinor}
            description="Never shown to customers."
          />
          <TextArea label="Notes" value={notes} onChange={setNotes} isOptional rows={3} />
        </FormLayout>
        <Button
          label={isSaving ? 'Saving…' : initial ? 'Save changes' : 'Create product'}
          variant="primary"
          isDisabled={name.trim() === '' || type.trim() === '' || isSaving}
          onClick={() => void save()}
        />
      </Stack>
    </Card>
  )
}
