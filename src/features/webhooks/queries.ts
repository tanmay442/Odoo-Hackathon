import { desc, eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { webhookDeliveries, webhookEndpoints } from '../../db/schema/webhooks'

export function listWebhookEndpoints(database: Database) {
  return database.query.webhookEndpoints.findMany({
    orderBy: [desc(webhookEndpoints.createdAt)],
  })
}

export function getWebhookEndpoint(database: Database, id: string) {
  return database.query.webhookEndpoints.findFirst({
    where: eq(webhookEndpoints.id, id),
  })
}

export function listActiveEndpointsFor(database: Database, eventType: string) {
  return database.query.webhookEndpoints.findMany({
    where: eq(webhookEndpoints.isActive, true),
  }).then((rows) => rows.filter((row) => row.eventTypes.includes(eventType)))
}

export function listWebhookDeliveries(database: Database, limit = 100) {
  return database.query.webhookDeliveries.findMany({
    orderBy: [desc(webhookDeliveries.createdAt)],
    limit: Math.min(200, Math.max(1, limit)),
  })
}

export function getWebhookDelivery(database: Database, deliveryId: string) {
  return database.query.webhookDeliveries.findFirst({
    where: eq(webhookDeliveries.id, deliveryId),
  })
}
