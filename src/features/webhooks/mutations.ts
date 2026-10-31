import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { outboxEvents } from '../../db/schema/outbox'
import { webhookDeliveries, webhookEndpoints } from '../../db/schema/webhooks'
import type { UserRow } from '../../db/schema/users'
import { assertAdminRole, ForbiddenError } from '../../lib/auth'

import type { WebhookCreateInput } from './schema'

function randomSecret(bytes = 32): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function assertHttpUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ForbiddenError()
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new ForbiddenError()
}

export async function createWebhookEndpoint(database: Database, actor: UserRow, input: WebhookCreateInput) {
  assertAdminRole(actor.role)
  assertHttpUrl(input.url)
  const plainSecret = randomSecret()
  const inserted = await database
    .insert(webhookEndpoints)
    .values({
      url: input.url,
      eventTypes: [...input.eventTypes],
      signingSecret: plainSecret,
      isActive: true,
    })
    .returning()
  if (inserted.length === 0) throw new Error('Webhook insert lost its row')
  return { row: inserted[0], plainSecret }
}

export async function setWebhookActive(database: Database, actor: UserRow, id: string, isActive: boolean) {
  assertAdminRole(actor.role)
  const updated = await database
    .update(webhookEndpoints)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(webhookEndpoints.id, id))
    .returning()
  if (updated.length === 0) throw new ForbiddenError()
  return updated[0]
}

export async function deleteWebhookEndpoint(database: Database, actor: UserRow, id: string) {
  assertAdminRole(actor.role)
  const deleted = await database.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id)).returning()
  if (deleted.length === 0) throw new ForbiddenError()
}

export async function redeliverWebhook(database: Database, actor: UserRow, deliveryId: string) {
  assertAdminRole(actor.role)
  const now = new Date()
  const updated = await database
    .update(webhookDeliveries)
    .set({ status: 'pending', attempts: 0, lastError: null, nextAttemptAt: now, updatedAt: now })
    .where(eq(webhookDeliveries.id, deliveryId))
    .returning()
  if (updated.length === 0) throw new ForbiddenError()
  const delivery = updated[0]
  await database
    .update(outboxEvents)
    .set({ status: 'pending', lastError: null, nextAttemptAt: now })
    .where(eq(outboxEvents.id, delivery.eventId))
  return delivery
}
