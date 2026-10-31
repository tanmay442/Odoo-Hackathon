import { clerkClient } from '@clerk/tanstack-react-start/server'

import type { Database } from '../../db/client'
import type { UserRow } from '../../db/schema/users'
import {
  ForbiddenError,
  UnauthorizedError,
  canActAsAdmin,
  canActAsStaff,
  canOwnCustomer,
  currentClerkUserId,
} from '../../lib/auth'
import { ensureUserRecord } from './mutations'
import { getUserByClerkId } from './queries'

// Takes an explicit session id so data functions stay testable without a
// request context. Only the missing-row path touches the Clerk API.
export async function resolveUserRecord(
  database: Database,
  clerkUserId: string,
): Promise<UserRow> {
  const existing = await getUserByClerkId(database, clerkUserId)
  if (existing) return existing
  const clerkUser = await clerkClient().users.getUser(clerkUserId)
  const email = clerkUser.primaryEmailAddress?.emailAddress
  if (!email) throw new UnauthorizedError()
  const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim()
  const [localPart] = email.split('@')
  return ensureUserRecord(database, {
    clerkUserId,
    email,
    displayName: fullName || localPart || email,
  })
}

export async function currentUserRecord(database: Database): Promise<UserRow> {
  return resolveUserRecord(database, await currentClerkUserId())
}

function denyUnless(allowed: boolean): void {
  if (!allowed) throw new ForbiddenError()
}

export async function requireAdminRecord(database: Database, clerkUserId: string): Promise<UserRow> {
  const user = await resolveUserRecord(database, clerkUserId)
  denyUnless(canActAsAdmin(user.role))
  return user
}

export async function requireStaffRecord(database: Database, clerkUserId: string): Promise<UserRow> {
  const user = await resolveUserRecord(database, clerkUserId)
  denyUnless(canActAsStaff(user.role))
  return user
}

export async function requireCustomerOwnerRecord(
  database: Database,
  clerkUserId: string,
  customerId: string,
): Promise<UserRow> {
  const user = await resolveUserRecord(database, clerkUserId)
  if (!canOwnCustomer(user.role, user.customerId, customerId)) throw new ForbiddenError()
  return user
}

export async function requireAdmin(database: Database): Promise<UserRow> {
  return requireAdminRecord(database, await currentClerkUserId())
}

export async function requireStaff(database: Database): Promise<UserRow> {
  return requireStaffRecord(database, await currentClerkUserId())
}

export async function requireCustomerOwner(
  database: Database,
  customerId: string,
): Promise<UserRow> {
  return requireCustomerOwnerRecord(database, await currentClerkUserId(), customerId)
}
