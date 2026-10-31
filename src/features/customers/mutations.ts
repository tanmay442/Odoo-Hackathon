import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { customers } from '../../db/schema/customers'
import type { UserRow } from '../../db/schema/users'
import { assertAdminRole, canActAsStaff, ForbiddenError } from '../../lib/auth'
import { subscriptions } from '../../db/schema/subscriptions'

import { getCustomer } from './queries'
import type { CustomerInput, UpdateCustomerInput } from './schema'

function cleanOptional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export async function createCustomer(database: Database, actor: UserRow, input: CustomerInput) {
  if (!canActAsStaff(actor.role)) throw new ForbiddenError()
  const inserted = await database
    .insert(customers)
    .values({
      displayName: input.displayName.trim(),
      email: input.email,
      phone: cleanOptional(input.phone),
      billingAddress: cleanOptional(input.billingAddress),
      taxIdentifier: cleanOptional(input.taxIdentifier),
      notes: cleanOptional(input.notes),
    })
    .returning()
  if (inserted.length === 0) throw new Error('Customer insert lost its row')
  return inserted[0]
}

export interface CustomerContactEdit {
  id: string
  displayName?: string
  email?: string
  phone?: string | null
  billingAddress?: string | null
  notes?: string | null
  taxIdentifier?: string | null
}

export async function updateCustomer(
  database: Database,
  actor: UserRow,
  customerId: string,
  input: CustomerContactEdit,
) {
  const existing = await getCustomer(database, customerId)
  if (!existing) throw new ForbiddenError()
  const ownsRecord = actor.customerId === customerId
  const isStaff = canActAsStaff(actor.role)
  if (!isStaff && !ownsRecord) throw new ForbiddenError()
  if (!isStaff && input.taxIdentifier !== undefined) throw new ForbiddenError()
  const updated = await database
    .update(customers)
    .set({
      displayName: input.displayName?.trim() ?? existing.displayName,
      email: input.email ?? existing.email,
      phone: input.phone === undefined ? existing.phone : cleanOptional(input.phone),
      billingAddress:
        input.billingAddress === undefined ? existing.billingAddress : cleanOptional(input.billingAddress),
      notes: input.notes === undefined ? existing.notes : cleanOptional(input.notes),
      taxIdentifier:
        input.taxIdentifier === undefined ? existing.taxIdentifier : cleanOptional(input.taxIdentifier),
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId))
    .returning()
  if (updated.length === 0) throw new ForbiddenError()
  return updated[0]
}

export async function staffUpdateCustomer(
  database: Database,
  actor: UserRow,
  input: UpdateCustomerInput,
) {
  if (!canActAsStaff(actor.role)) throw new ForbiddenError()
  return updateCustomer(database, actor, input.id, {
    id: input.id,
    displayName: input.displayName,
    email: input.email,
    phone: input.phone,
    billingAddress: input.billingAddress,
    notes: input.notes,
    taxIdentifier: input.taxIdentifier,
  })
}

export async function archiveCustomer(database: Database, actor: UserRow, customerId: string) {
  if (!canActAsStaff(actor.role)) throw new ForbiddenError()
  const existing = await getCustomer(database, customerId)
  if (!existing) throw new ForbiddenError()
  const liveSubscription = await database.query.subscriptions.findFirst({
    columns: { id: true },
    where: eq(subscriptions.customerId, customerId),
  })
  if (liveSubscription) throw new ForbiddenError()
  const updated = await database
    .update(customers)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .returning()
  if (updated.length === 0) throw new ForbiddenError()
  return updated[0]
}

export async function restoreCustomer(database: Database, actor: UserRow, customerId: string) {
  assertAdminRole(actor.role)
  const restored = await database
    .update(customers)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .returning()
  if (restored.length === 0) throw new ForbiddenError()
  return restored[0]
}
