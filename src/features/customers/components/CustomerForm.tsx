import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'

import type { CustomerRow } from '#/db/schema/customers'
import { customerCreateFn, customerUpdateFn } from '#/features/customers/functions'

interface CustomerFormProps {
  initial: CustomerRow | null
  onSaved: () => void
}

export function CustomerForm({ initial, onSaved }: CustomerFormProps) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [billingAddress, setBillingAddress] = useState(initial?.billingAddress ?? '')
  const [taxIdentifier, setTaxIdentifier] = useState(initial?.taxIdentifier ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function save() {
    if (!displayName.trim() || !email.trim()) {
      setError('Name and email are required.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const payload = {
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phone.trim() ? phone.trim() : null,
        billingAddress: billingAddress.trim() ? billingAddress.trim() : null,
        taxIdentifier: taxIdentifier.trim() ? taxIdentifier.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
      }
      const result = initial
        ? await customerUpdateFn({ data: { ...payload, id: initial.id } })
        : await customerCreateFn({ data: payload })
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
          <Heading level={2}>{initial ? 'Edit customer' : 'New customer'}</Heading>
          <FormLayout>
            <TextInput label="Display name" value={displayName} onChange={setDisplayName} isRequired />
            <TextInput label="Email" value={email} onChange={setEmail} isRequired />
            <TextInput label="Phone" value={phone} onChange={setPhone} isOptional />
            <TextInput label="Billing address" value={billingAddress} onChange={setBillingAddress} isOptional />
            <TextInput label="Tax identifier" value={taxIdentifier} onChange={setTaxIdentifier} isOptional description="Staff only. Never editable in the portal." />
            <TextInput label="Notes" value={notes} onChange={setNotes} isOptional />
          </FormLayout>
          <Button label={initial ? 'Save changes' : 'Create customer'} variant="primary" onClick={() => void save()} isLoading={isSaving} />
        </Stack>
      </Card>
    </Stack>
  )
}
