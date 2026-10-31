import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Stack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { TextInput } from '@astryxdesign/core/TextInput'

import type { TaxRow } from '#/db/schema/taxes'

import { taxCreateFn, taxUpdateFn } from '../functions'

interface TaxFormProps {
  initial: TaxRow | null
  onSaved: () => void
}

export function TaxForm({ initial, onSaved }: TaxFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [ratePercent, setRatePercent] = useState<number | null>(
    initial ? initial.rateBasisPoints / 100 : null,
  )
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function save() {
    if (ratePercent === null) {
      setError('Enter a rate.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const payload = {
        name: name.trim(),
        rateBasisPoints: Math.round(ratePercent * 100),
        isActive,
      }
      const result = initial
        ? await taxUpdateFn({ data: { ...payload, id: initial.id } })
        : await taxCreateFn({ data: payload })
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
        <Heading level={2}>{initial ? 'Edit tax' : 'New tax'}</Heading>
        {error ? <Banner status="error" title={error} /> : null}
        <FormLayout>
          <TextInput label="Name" value={name} onChange={setName} isRequired placeholder="GST 18%" />
          <NumberInput
            label="Rate"
            value={ratePercent}
            onChange={setRatePercent}
            units="%"
            min={0}
            max={100}
            step={0.5}
            isRequired
            description="Stored as basis points; 18% becomes 1800."
          />
          <Switch
            label="Active"
            description="Only active taxes can be picked on new lines. Deactivating never changes confirmed invoices."
            value={isActive}
            onChange={setIsActive}
          />
        </FormLayout>
        <Button
          label={isSaving ? 'Saving…' : initial ? 'Save changes' : 'Create tax'}
          variant="primary"
          isDisabled={name.trim() === '' || isSaving}
          onClick={() => void save()}
        />
      </Stack>
    </Card>
  )
}
