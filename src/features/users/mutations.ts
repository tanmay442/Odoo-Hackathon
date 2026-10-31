import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { customers } from '../../db/schema/customers'
import { staffInvites } from '../../db/schema/staff-invites'
import type { UserRole } from '../../db/schema/users'
import { users } from '../../db/schema/users'
import { ForbiddenError, isSeedAdminEmail } from '../../lib/auth'

import { getUserByClerkId, getUserById } from './queries'

interface Identity {
  clerkUserId: string
  email: string
  displayName: string
}

function normalizedEmail(email: string): string {
  return email.toLowerCase()
}

async function linkCustomer(database: Database, identity: Identity) {
  const normalized = normalizedEmail(identity.email)
  const invite = await database.query.staffInvites.findFirst({
    where: eq(staffInvites.email, normalized),
  })
  if (invite) {
    await database.delete(staffInvites).where(eq(staffInvites.id, invite.id))
    const insertedStaff = await database
      .insert(users)
      .values({
        clerkUserId: identity.clerkUserId,
        email: normalized,
        role: 'staff',
      })
      .onConflictDoNothing({ target: users.clerkUserId })
      .returning()
    if (insertedStaff.length > 0) return insertedStaff[0]
    return getUserByClerkId(database, identity.clerkUserId)
  }
  const insertedCustomers = await database
    .insert(customers)
    .values({ displayName: identity.displayName, email: normalized })
    .returning()
  const insertedUsers = await database
    .insert(users)
    .values({
      clerkUserId: identity.clerkUserId,
      email: normalized,
      role: 'customer',
      customerId: insertedCustomers[0].id,
    })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning()
  if (insertedUsers.length > 0) return insertedUsers[0]
  await database.delete(customers).where(eq(customers.id, insertedCustomers[0].id))
  return getUserByClerkId(database, identity.clerkUserId)
}

// Clerk ⇄ DB mirror: creates the row on first sight (webhook or lazy
// upsert). Concurrent deliveries collapse on the clerk_user_id unique
// constraint and read back the single row.
export async function ensureUserRecord(database: Database, identity: Identity) {
  const existing = await getUserByClerkId(database, identity.clerkUserId)
  if (existing) {
    if (isSeedAdminEmail(existing.email) && existing.role !== 'admin') {
      const promoted = await database
        .update(users)
        .set({ role: 'admin', isSeedAdmin: true, updatedAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning()
      if (promoted.length > 0) return promoted[0]
    }
    return existing
  }
  if (isSeedAdminEmail(identity.email)) {
    const insertedAdmin = await database
      .insert(users)
      .values({
        clerkUserId: identity.clerkUserId,
        email: normalizedEmail(identity.email),
        role: 'admin',
        isSeedAdmin: true,
      })
      .onConflictDoNothing({ target: users.clerkUserId })
      .returning()
    if (insertedAdmin.length > 0) return insertedAdmin[0]
    return getUserByClerkId(database, identity.clerkUserId)
  }
  const created = await linkCustomer(database, identity)
  if (!created) throw new Error('User upsert lost its row')
  return created
}

export async function applyWebhookUpdate(
  database: Database,
  identity: Omit<Identity, 'displayName'>,
) {
  await database
    .update(users)
    .set({ email: normalizedEmail(identity.email), updatedAt: new Date() })
    .where(eq(users.clerkUserId, identity.clerkUserId))
}

export async function applyWebhookDelete(database: Database, clerkUserId: string) {
  await database.delete(users).where(eq(users.clerkUserId, clerkUserId))
}

export async function setUserRole(
  database: Database,
  targetUserId: string,
  role: UserRole,
) {
  const target = await getUserById(database, targetUserId)
  if (!target) throw new ForbiddenError()
  if (target.isSeedAdmin && role !== 'admin') throw new ForbiddenError()
  const updatedRows = await database
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, targetUserId))
    .returning()
  if (updatedRows.length === 0) throw new ForbiddenError()
  return updatedRows[0]
}

export async function recordStaffInvite(database: Database, email: string) {
  const normalized = normalizedEmail(email)
  await database
    .insert(staffInvites)
    .values({ email: normalized })
    .onConflictDoNothing({ target: staffInvites.email })
}
