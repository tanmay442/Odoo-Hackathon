import { clerkClient } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../../db/client'
import { currentClerkUserId, guardServerFn, landingPathForRole } from '../../lib/auth'

import { requireAdminRecord, requireStaffRecord, resolveUserRecord } from './guards'
import { recordStaffInvite, setUserRole } from './mutations'
import { listUsers } from './queries'
import { staffInviteSchema, updateUserRoleSchema } from './schema'

export const sessionUserFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const user = await resolveUserRecord(getDatabase(), await currentClerkUserId())
    return { ...user, landingPath: landingPathForRole(user.role) }
  }),
)

export const staffListFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    await requireAdminRecord(getDatabase(), await currentClerkUserId())
    return listUsers(getDatabase())
  }),
)

export const staffInviteFn = createServerFn({ method: 'POST' })
  .validator(staffInviteSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      await requireAdminRecord(getDatabase(), await currentClerkUserId())
      const invitation = await clerkClient().invitations.createInvitation({
        emailAddress: data.email,
        redirectUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/post-sign-in`,
      })
      await recordStaffInvite(getDatabase(), data.email)
      return { invitationId: invitation.id, email: data.email }
    }),
  )

export const updateUserRoleFn = createServerFn({ method: 'POST' })
  .validator(updateUserRoleSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      await requireAdminRecord(getDatabase(), await currentClerkUserId())
      const updated = await setUserRole(getDatabase(), data.userId, data.role)
      // Display-only mirror; our DB stays the source of truth if this fails.
      try {
        await clerkClient().users.updateUserMetadata(updated.clerkUserId, {
          publicMetadata: { role: updated.role },
        })
      } catch (error) {
        console.warn('Clerk role mirror failed', error)
      }
      return updated
    }),
  )

export const appAccessFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const user = await requireStaffRecord(getDatabase(), await currentClerkUserId())
    return { role: user.role, landingPath: landingPathForRole(user.role) }
  }),
)

export const adminAccessFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const user = await requireAdminRecord(getDatabase(), await currentClerkUserId())
    return { role: user.role }
  }),
)
