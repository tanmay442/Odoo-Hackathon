import { eq } from 'drizzle-orm'
import { Webhook } from 'svix'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDatabase } from '../../src/db/client'
import { customers } from '../../src/db/schema/customers'
import { staffInvites } from '../../src/db/schema/staff-invites'
import { users } from '../../src/db/schema/users'
import { ForbiddenError, toHttpResponse } from '../../src/lib/auth'
import {
  requireAdminRecord,
  requireCustomerOwnerRecord,
  requireStaffRecord,
} from '../../src/features/users/guards'
import { ensureUserRecord, recordStaffInvite, setUserRole } from '../../src/features/users/mutations'
import { getUserByClerkId } from '../../src/features/users/queries'
import { handleClerkWebhook } from '../../src/features/users/webhook'

const database = getDatabase()

async function truncate() {
  await database.delete(users)
  await database.delete(staffInvites)
  await database.delete(customers)
}

beforeAll(async () => {
  await truncate()
})

beforeEach(async () => {
  await truncate()
})

const signingSecret = `whsec_${Buffer.from('test-secret-key-for-webhooks-0001').toString('base64')}`

function signedRequest(payload: unknown) {
  const rawBody = JSON.stringify(payload)
  const id = `msg_${Math.random().toString(36).slice(2)}`
  const timestamp = new Date()
  const signature = new Webhook(signingSecret).sign(id, timestamp, rawBody)
  return {
    headers: new Headers({
      'svix-id': id,
      'svix-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
      'svix-signature': signature,
    }),
    rawBody,
  }
}

function createdPayload(clerkUserId: string, email: string, firstName = 'Test') {
  return {
    type: 'user.created',
    data: {
      id: clerkUserId,
      first_name: firstName,
      last_name: 'User',
      primary_email_address_id: 'email-1',
      email_addresses: [{ id: 'email-1', email_address: email }],
    },
  }
}

describe('clerk webhook', () => {
  it('rejects a bad signature with 401 and writes nothing', async () => {
    const response = await handleClerkWebhook({
      database,
      headers: new Headers(),
      rawBody: JSON.stringify(createdPayload('user_bad', 'bad@example.com')),
      signingSecret,
    })
    expect(response.status).toBe(401)
    expect(await database.query.users.findMany()).toHaveLength(0)
  })

  it('creates one users row for a duplicated user.created delivery', async () => {
    const payload = createdPayload('user_dup', 'dup@example.com')
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await handleClerkWebhook({
        database,
        ...signedRequest(payload),
        signingSecret,
      })
      expect(response.status).toBe(200)
    }
    const rows = await database.query.users.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.role).toBe('customer')
    expect(rows[0]?.customerId).toBeTruthy()
  })

  it('links a self-signup to a new customer row', async () => {
    const response = await handleClerkWebhook({
      database,
      ...signedRequest(createdPayload('user_self', 'self@example.com')),
      signingSecret,
    })
    expect(response.status).toBe(200)
    const user = await getUserByClerkId(database, 'user_self')
    if (!user?.customerId) throw new Error('Signup did not link a customer')
    const customerId = user.customerId
    const linked = await database.query.customers.findFirst({
      where: eq(customers.id, customerId),
    })
    expect(linked?.email).toBe('self@example.com')
  })

  it('grants staff role when the email was invited', async () => {
    await recordStaffInvite(database, 'Teammate@Example.com')
    const response = await handleClerkWebhook({
      database,
      ...signedRequest(createdPayload('user_invited', 'teammate@example.com')),
      signingSecret,
    })
    expect(response.status).toBe(200)
    const user = await getUserByClerkId(database, 'user_invited')
    expect(user?.role).toBe('staff')
    expect(user?.customerId).toBeNull()
  })

  it('deletes the row on user.deleted and keeps the customer', async () => {
    await handleClerkWebhook({
      database,
      ...signedRequest(createdPayload('user_gone', 'gone@example.com')),
      signingSecret,
    })
    const deletedPayload = { type: 'user.deleted', data: { id: 'user_gone' } }
    const response = await handleClerkWebhook({
      database,
      ...signedRequest(deletedPayload),
      signingSecret,
    })
    expect(response.status).toBe(200)
    expect(await getUserByClerkId(database, 'user_gone')).toBeUndefined()
    expect(await database.query.customers.findMany()).toHaveLength(1)
  })
})

describe('lazy upsert', () => {
  it('creates the row and customer link on first sight', async () => {
    const user = await ensureUserRecord(database, {
      clerkUserId: 'user_lazy',
      email: 'Lazy@Example.com',
      displayName: 'Lazy User',
    })
    expect(user.email).toBe('lazy@example.com')
    expect(user.role).toBe('customer')
    const again = await ensureUserRecord(database, {
      clerkUserId: 'user_lazy',
      email: 'lazy@example.com',
      displayName: 'Lazy User',
    })
    expect(again.id).toBe(user.id)
  })

  it('grants staff role on lazy upsert when the email was invited', async () => {
    await recordStaffInvite(database, 'lazy-staff@example.com')
    const invited = await ensureUserRecord(database, {
      clerkUserId: 'user_lazy_staff',
      email: 'lazy-staff@example.com',
      displayName: 'Lazy Staff',
    })
    expect(invited.role).toBe('staff')
    expect(invited.customerId).toBeNull()
  })
})

describe('server-side guards', () => {
  it('refuses a customer at admin and staff gates with a 403 response', async () => {
    const customer = await ensureUserRecord(database, {
      clerkUserId: 'user_cust_gate',
      email: 'cust-gate@example.com',
      displayName: 'Cust Gate',
    })
    await expect(requireAdminRecord(database, 'user_cust_gate')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    await expect(requireStaffRecord(database, 'user_cust_gate')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    await expect(
      requireCustomerOwnerRecord(database, 'user_cust_gate', 'someone-else'),
    ).rejects.toBeInstanceOf(ForbiddenError)
    if (!customer.customerId) throw new Error('Customer link missing')
    const owner = await requireCustomerOwnerRecord(
      database,
      'user_cust_gate',
      customer.customerId,
    )
    expect(owner.id).toBe(customer.id)
    expect(toHttpResponse(new ForbiddenError()).status).toBe(403)
  })

  it('lets staff through the staff gate but not the admin gate', async () => {
    await ensureUserRecord(database, {
      clerkUserId: 'user_staff_gate',
      email: 'staff-gate@example.com',
      displayName: 'Staff Gate',
    })
    const staffRow = await getUserByClerkId(database, 'user_staff_gate')
    if (!staffRow) throw new Error('Staff row missing')
    await database.update(users).set({ role: 'staff' }).where(eq(users.id, staffRow.id))
    await requireStaffRecord(database, 'user_staff_gate')
    await expect(requireAdminRecord(database, 'user_staff_gate')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })
})

describe('role changes', () => {
  it('refuses to demote the seeded first admin', async () => {
    const admin = await ensureUserRecord(database, {
      clerkUserId: 'user_seed',
      email: 'seed@example.com',
      displayName: 'Seed Admin',
    })
    await setUserRole(database, admin.id, 'admin')
    await database.update(users).set({ isSeedAdmin: true }).where(eq(users.id, admin.id))
    await expect(setUserRole(database, admin.id, 'staff')).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    expect((await getUserByClerkId(database, 'user_seed'))?.role).toBe('admin')
  })
})
