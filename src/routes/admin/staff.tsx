import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'

import { staffInviteFn, staffListFn, updateUserRoleFn } from '#/features/users/functions'
import type { UserRow } from '#/db/schema/users'

export const Route = createFileRoute('/admin/staff')({
  loader: async () => {
    const members = await staffListFn()
    if (members instanceof Response) {
      if (members.status === 401) throw redirect({ to: '/sign-in' })
      throw new Error('FORBIDDEN')
    }
    return members
  },
  component: StaffPage,
})

const roleBadgeVariant = {
  admin: 'info',
  staff: 'neutral',
  customer: 'neutral',
} as const

function StaffPage() {
  const members = Route.useLoaderData()
  const router = useRouter()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [isInviting, setIsInviting] = useState(false)
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null)
  const [roleError, setRoleError] = useState<string | null>(null)

  async function sendInvite() {
    setInviteError(null)
    setIsInviting(true)
    try {
      const result = await staffInviteFn({ data: { email: inviteEmail } })
      if (result instanceof Response) throw new Error('Invite refused')
      setInviteEmail('')
      await router.invalidate()
    } catch {
      setInviteError('Invite failed. Check the email address and try again.')
    } finally {
      setIsInviting(false)
    }
  }

  async function confirmRoleChange() {
    if (!roleTarget) return
    setRoleError(null)
    const nextRole = roleTarget.role === 'staff' ? 'customer' : 'staff'
    try {
      const result = await updateUserRoleFn({ data: { userId: roleTarget.id, role: nextRole } })
      if (result instanceof Response) throw new Error('Role change refused')
      setRoleTarget(null)
      await router.invalidate()
    } catch {
      setRoleTarget(null)
      setRoleError('Role change refused. The seeded admin keeps admin access.')
    }
  }

  return (
    <Stack gap={4}>
      <Heading level={1}>Staff</Heading>
      {roleError ? <Banner status="error" title={roleError} /> : null}
      <Card>
        <Stack gap={2}>
          <Heading level={2}>Invite a staff member</Heading>
          <Text>They receive a sign-in invitation by email and join as staff.</Text>
          {inviteError ? <Banner status="error" title={inviteError} /> : null}
          <Stack direction="horizontal" gap={2}>
            <TextInput
              label="Email"
              type="email"
              value={inviteEmail}
              onChange={setInviteEmail}
              placeholder="colleague@example.com"
            />
            <Button
              label={isInviting ? 'Sending…' : 'Send invite'}
              variant="primary"
              isDisabled={inviteEmail.trim() === '' || isInviting}
              onClick={() => void sendInvite()}
            />
          </Stack>
        </Stack>
      </Card>
      <Table
        data={members}
        idKey="id"
        columns={[
          { key: 'email', header: 'Email' },
          {
            key: 'role',
            header: 'Role',
            renderCell: (member: UserRow) => (
              <Badge label={member.role} variant={roleBadgeVariant[member.role]} />
            ),
          },
          {
            key: 'actions',
            header: 'Actions',
            renderCell: (member: UserRow) =>
              member.role === 'admin' ? (
                <Text>Seed admin</Text>
              ) : (
                <Button
                  label={member.role === 'staff' ? 'Demote to customer' : 'Promote to staff'}
                  size="sm"
                  onClick={() => setRoleTarget(member)}
                />
              ),
          },
        ]}
      />
      {roleTarget ? (
        <AlertDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setRoleTarget(null)
          }}
          title={roleTarget.role === 'staff' ? 'Demote to customer?' : 'Promote to staff?'}
          description={
            roleTarget.role === 'staff'
              ? `${roleTarget.email} will lose access to the staff workspace.`
              : `${roleTarget.email} will gain access to the staff workspace.`
          }
          actionLabel="Confirm"
          onAction={() => void confirmRoleChange()}
        />
      ) : null}
    </Stack>
  )
}
