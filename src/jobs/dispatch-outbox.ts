import { and, eq, lte } from 'drizzle-orm'

import type { Database } from '../db/client'
import { outboxEvents } from '../db/schema/outbox'
import { webhookDeliveries, webhookEndpoints } from '../db/schema/webhooks'
import { dispatchPendingEmails } from '../features/email/dispatch'
import type { EmailPort } from '../ports/email-port'

const MAX_ATTEMPTS = 5
const BATCH_LIMIT = 50

export interface DispatchOptions {
  now?: Date
  fetchImpl?: typeof fetch
  emailPort?: EmailPort
}

export interface DispatchSummary {
  events: number
  delivered: number
  dead: number
  emailsAttempted: number
  emailsSent: number
}

// Destr-Signature carries the hex HMAC-SHA256 of the raw JSON body,
// computed with the endpoint's signing secret.
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function backoffAt(now: Date, attempts: number): Date {
  const minutes = 2 ** Math.max(0, attempts - 1)
  return new Date(now.getTime() + minutes * 60_000)
}

async function postWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  body: string,
  signature: string,
): Promise<{ ok: boolean; status: number }> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'destr-signature': signature },
    body,
    signal: AbortSignal.timeout(10_000),
  })
  return { ok: response.ok, status: response.status }
}

export async function dispatchOutboxWithDatabase(
  database: Database,
  options: DispatchOptions = {},
): Promise<DispatchSummary> {
  const now = options.now ?? new Date()
  const fetchImpl = options.fetchImpl ?? fetch
  const pending = await database.query.outboxEvents.findMany({
    where: and(
      lte(outboxEvents.nextAttemptAt, now),
      eq(outboxEvents.status, 'pending'),
    ),
    limit: BATCH_LIMIT,
  })
  const delivering = await database.query.outboxEvents.findMany({
    where: and(lte(outboxEvents.nextAttemptAt, now), eq(outboxEvents.status, 'delivering')),
    limit: BATCH_LIMIT,
  })
  const events = [...pending, ...delivering].slice(0, BATCH_LIMIT)
  let delivered = 0
  let dead = 0
  for (const event of events) {
    const endpoints = await database.query.webhookEndpoints.findMany({
      where: eq(webhookEndpoints.isActive, true),
    })
    const matching = endpoints.filter((endpoint) => endpoint.eventTypes.includes(event.type))
    if (matching.length === 0) {
      await database
        .update(outboxEvents)
        .set({ status: 'delivered', attempts: event.attempts + 1 })
        .where(eq(outboxEvents.id, event.id))
      delivered += 1
      continue
    }
    const body = JSON.stringify({
      id: event.id,
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt,
    })
    let allDelivered = true
    for (const endpoint of matching) {
      const existing = await database.query.webhookDeliveries.findMany({
        where: and(
          eq(webhookDeliveries.endpointId, endpoint.id),
          eq(webhookDeliveries.eventId, event.id),
        ),
        limit: 1,
      })
      if (existing.length === 0) {
        await database.insert(webhookDeliveries).values({
          endpointId: endpoint.id,
          eventId: event.id,
          status: 'pending',
          lastPayload: event.payload,
          nextAttemptAt: now,
        })
      }
      const reloaded = await database.query.webhookDeliveries.findMany({
        where: and(
          eq(webhookDeliveries.endpointId, endpoint.id),
          eq(webhookDeliveries.eventId, event.id),
        ),
        limit: 1,
      })
      if (reloaded.length === 0) continue
      const delivery = reloaded[0]
      if (delivery.status === 'delivered') continue
      if (delivery.status === 'dead') {
        allDelivered = false
        continue
      }
      if (delivery.nextAttemptAt > now) {
        allDelivered = false
        continue
      }
      const signature = await hmacSha256Hex(endpoint.signingSecret, body)
      try {
        const result = await postWithTimeout(fetchImpl, endpoint.url, body, signature)
        if (result.ok) {
          await database
            .update(webhookDeliveries)
            .set({
              status: 'delivered',
              attempts: delivery.attempts + 1,
              lastStatusCode: result.status,
              lastError: null,
              updatedAt: now,
            })
            .where(eq(webhookDeliveries.id, delivery.id))
        } else {
          const attempts = delivery.attempts + 1
          const exhausted = attempts >= MAX_ATTEMPTS
          await database
            .update(webhookDeliveries)
            .set({
              status: exhausted ? 'dead' : 'delivering',
              attempts,
              lastStatusCode: result.status,
              lastError: `HTTP ${result.status}`,
              nextAttemptAt: exhausted ? delivery.nextAttemptAt : backoffAt(now, attempts),
              updatedAt: now,
            })
            .where(eq(webhookDeliveries.id, delivery.id))
          allDelivered = false
        }
      } catch (error) {
        const attempts = delivery.attempts + 1
        const exhausted = attempts >= MAX_ATTEMPTS
        await database
          .update(webhookDeliveries)
          .set({
            status: exhausted ? 'dead' : 'delivering',
            attempts,
            lastError: error instanceof Error ? error.message : 'Delivery failed',
            nextAttemptAt: exhausted ? delivery.nextAttemptAt : backoffAt(now, attempts),
            updatedAt: now,
          })
          .where(eq(webhookDeliveries.id, delivery.id))
        allDelivered = false
      }
    }
    if (allDelivered) {
      await database
        .update(outboxEvents)
        .set({ status: 'delivered', attempts: event.attempts + 1 })
        .where(eq(outboxEvents.id, event.id))
      delivered += 1
    } else {
      const attempts = event.attempts + 1
      const stale = await database.query.webhookDeliveries.findMany({
        where: eq(webhookDeliveries.eventId, event.id),
      })
      const hasDead = stale.some((row) => row.status === 'dead')
      const hasLive = stale.some((row) => row.status === 'pending' || row.status === 'delivering')
      const status = !hasLive && hasDead ? 'dead' : 'delivering'
      if (status === 'dead') dead += 1
      const nextDelay = stale
        .filter((row) => row.status === 'pending' || row.status === 'delivering')
        .map((row) => row.nextAttemptAt.getTime())
      await database
        .update(outboxEvents)
        .set({
          status,
          attempts,
          lastError: hasLive ? null : 'All endpoints exhausted',
          nextAttemptAt: nextDelay.length > 0 ? new Date(Math.min(...nextDelay)) : event.nextAttemptAt,
        })
        .where(eq(outboxEvents.id, event.id))
    }
  }
  const emails = await dispatchPendingEmails(database, options.emailPort)
  return {
    events: events.length,
    delivered,
    dead,
    emailsAttempted: emails.attempted,
    emailsSent: emails.sent,
  }
}
