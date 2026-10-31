import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'

import type { ApiKeyRow } from '#/db/schema/api-keys'
import { apiKeyCreateFn, apiKeyListFn, apiKeyRevokeFn } from '#/features/api-keys/functions'

type ApiKeyListRow = Omit<ApiKeyRow, 'keyHash'>

export const Route = createFileRoute('/admin/api-keys')({
  loader: async () => {
    const rows = await apiKeyListFn()
    if (rows instanceof Response) {
      if (rows.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return rows
  },
  component: ApiKeysPage,
})

function ApiKeysPage() {
  const rows = Route.useLoaderData()
  const router = useRouter()
  const [name, setName] = useState('')
  const [readScope, setReadScope] = useState(true)
  const [writeScope, setWriteScope] = useState(false)
  const [verifyScope, setVerifyScope] = useState(false)
  const [plainKey, setPlainKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function create() {
    if (name.trim() === '') {
      setError('Name the key first.')
      return
    }
    const scopes = [
      readScope ? 'read' : null,
      writeScope ? 'write' : null,
      verifyScope ? 'payments:verify' : null,
    ].filter((scope): scope is 'read' | 'write' | 'payments:verify' => scope !== null)
    if (scopes.length === 0) {
      setError('Pick at least one scope.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      const result = await apiKeyCreateFn({ data: { name: name.trim(), scopes } })
      if (result instanceof Response) throw new Error('Create refused')
      setPlainKey(result.plainKey)
      setName('')
      await router.invalidate()
    } catch {
      setError('Key creation failed. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  async function revoke(row: ApiKeyListRow) {
    setError(null)
    const result = await apiKeyRevokeFn({ data: { id: row.id } })
    if (result instanceof Response) {
      setError('Revoke failed. Try again.')
      return
    }
    await router.invalidate()
  }

  return (
    <Stack gap={3}>
      <Stack direction="horizontal" gap={2}>
        <Heading level={1}>API keys</Heading>
      </Stack>
      {plainKey ? (
        <Card>
          <Stack gap={1}>
            <Heading level={2}>Copy this key once</Heading>
            <Text type="body">{plainKey}</Text>
            <Text type="supporting">Only the hash is stored. Revoke and reissue if it leaks.</Text>
            <Button label="Done" onClick={() => setPlainKey(null)} />
          </Stack>
        </Card>
      ) : null}
      {error ? <Banner status="error" title={error} /> : null}
      <Card>
        <Stack gap={2}>
          <Heading level={2}>New key</Heading>
          <FormLayout>
            <TextInput label="Name" value={name} onChange={setName} isRequired placeholder="Accounting sync" />
            <Switch label="read" description="List and read resources." value={readScope} onChange={setReadScope} />
            <Switch label="write" description="Create and change resources." value={writeScope} onChange={setWriteScope} />
            <Switch
              label="payments:verify"
              description="Verify or reject payments only."
              value={verifyScope}
              onChange={setVerifyScope}
            />
          </FormLayout>
          <Button label={isSaving ? 'Creating…' : 'Create key'} variant="primary" onClick={() => void create()} isDisabled={isSaving} />
        </Stack>
      </Card>
      <Table
        data={rows}
        idKey="id"
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'keyPrefix', header: 'Prefix' },
          {
            key: 'scopes',
            header: 'Scopes',
            renderCell: (row: ApiKeyListRow) => row.scopes.join(', '),
          },
          {
            key: 'revokedAt',
            header: 'Status',
            renderCell: (row: ApiKeyListRow) =>
              row.revokedAt ? <Badge label="Revoked" variant="neutral" /> : <Badge label="Live" variant="info" />,
          },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (row: ApiKeyListRow) =>
              row.revokedAt ? null : (
                <Button label="Revoke" size="sm" onClick={() => void revoke(row)} />
              ),
          },
        ]}
      />
    </Stack>
  )
}
