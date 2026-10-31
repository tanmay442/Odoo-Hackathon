import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'

import { portalAccountFn, portalAccountUpdateFn } from '#/features/customers/functions'

export const Route = createFileRoute('/portal/account')({
  loader: async () => {
    const account = await portalAccountFn()
    if (account instanceof Response) {
      if (account.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return account
  },
  component: PortalAccountPage,
})

function PortalAccountPage() {
  const account = Route.useLoaderData()
  const router = useRouter()
  const [displayName, setDisplayName] = useState(account?.displayName ?? '')
  const [email, setEmail] = useState(account?.email ?? '')
  const [phone, setPhone] = useState(account?.phone ?? '')
  const [billingAddress, setBillingAddress] = useState(account?.billingAddress ?? '')
  const [notes, setNotes] = useState(account?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save() {
    setError(null)
    setSaved(false)
    const result = await portalAccountUpdateFn({
      data: {
        displayName: displayName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() ? phone.trim() : null,
        billingAddress: billingAddress.trim() ? billingAddress.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
      },
    })
    if (result instanceof Response) {
      setError('Saving failed. Try again.')
      return
    }
    setSaved(true)
    await router.invalidate()
  }

  if (!account) {
    return (
      <Stack gap={3}>
        <Heading level={1}>Account</Heading>
        <Card>
          <Text type="supporting">No customer record is linked to this login yet.</Text>
        </Card>
      </Stack>
    )
  }

  return (
    <Stack gap={3}>
      <Heading level={1}>Account</Heading>
      {error ? <Banner status="error" title={error} /> : null}
      {saved ? <Banner status="success" title="Contact details saved." /> : null}
      <Card>
        <Stack gap={2}>
          <FormLayout>
            <TextInput label="Display name" value={displayName} onChange={setDisplayName} />
            <TextInput label="Email" value={email} onChange={setEmail} />
            <TextInput label="Phone" value={phone} onChange={setPhone} isOptional />
            <TextInput label="Billing address" value={billingAddress} onChange={setBillingAddress} isOptional />
            <TextInput label="Notes" value={notes} onChange={setNotes} isOptional />
            <TextInput label="Tax identifier" value={account.taxIdentifier ?? ''} onChange={() => undefined} isReadOnly disabledMessage="Only staff can change the tax identifier." />
          </FormLayout>
          <Text type="supporting">Tax identifier is staff-only and stays read-only here.</Text>
          <Button label="Save contact details" variant="primary" onClick={() => void save()} />
        </Stack>
      </Card>
    </Stack>
  )
}
