import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Stack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { TextInput } from '@astryxdesign/core/TextInput'

import type { QuotationTemplateRow } from '#/db/schema/templates'
import { templateCreateFn, templateUpdateFn } from '#/features/templates/functions'

import { SubscriptionLineEditor    } from '#/features/subscriptions/components/SubscriptionLineEditor'
import type {EditableLine, LineEditorProduct, LineEditorTax} from '#/features/subscriptions/components/SubscriptionLineEditor';

interface TemplateFormProps {
  initial: (QuotationTemplateRow & { lines: Array<EditableLine & { id?: string }> }) | null
  plans: Array<{ id: string; name: string }>
  products: LineEditorProduct[]
  taxes: LineEditorTax[]
  onSaved: () => void
}

export function TemplateForm({ initial, plans, products, taxes, onSaved }: TemplateFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [planId, setPlanId] = useState(initial?.planId ?? (plans.length > 0 ? plans[0].id : ''))
  const [validityDays, setValidityDays] = useState(initial?.validityDays ?? 30)
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [lines, setLines] = useState<EditableLine[]>(
    initial?.lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      description: '',
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxIds: line.taxIds,
    })) ?? [],
  )
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function save() {
    if (!name.trim() || !planId || lines.length === 0) {
      setError('Name, plan, and at least one line are required.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const payload = { name: name.trim(), planId, validityDays, isActive, lines }
      const result = initial
        ? await templateUpdateFn({ data: { ...payload, id: initial.id } })
        : await templateCreateFn({ data: payload })
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
          <Heading level={2}>{initial ? 'Edit template' : 'New template'}</Heading>
          <FormLayout>
            <TextInput label="Name" value={name} onChange={setName} isRequired />
            <Selector
              label="Plan"
              options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
              value={planId}
              onChange={setPlanId}
            />
            <NumberInput label="Validity days" value={validityDays} onChange={(days) => setValidityDays(Math.max(1, Math.round(days)))} min={1} step={1} />
            <Switch label="Active" value={isActive} onChange={setIsActive} />
          </FormLayout>
          <SubscriptionLineEditor lines={lines} products={products} taxes={taxes} onChange={setLines} />
          <Button label={initial ? 'Save changes' : 'Create template'} variant="primary" onClick={() => void save()} isLoading={isSaving} />
        </Stack>
      </Card>
    </Stack>
  )
}
