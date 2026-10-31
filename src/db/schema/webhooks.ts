import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { outboxEvents, outboxStatus } from './outbox'

export const webhookEventTypes = [
  'invoice.generated',
  'invoice.paid',
  'payment.verified',
  'subscription.activated',
  'subscription.closed',
  'subscription.paused',
] as const

export type WebhookEventType = (typeof webhookEventTypes)[number]

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull(),
  eventTypes: text('event_types').array().notNull(),
  signingSecret: text('signing_secret').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => outboxEvents.id, { onDelete: 'cascade' }),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastStatusCode: integer('last_status_code'),
    lastError: text('last_error'),
    lastPayload: jsonb('last_payload').$type<Record<string, string | null>>(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (delivery) => [
    index('webhook_deliveries_status_next_idx').on(delivery.status, delivery.nextAttemptAt),
    index('webhook_deliveries_endpoint_idx').on(delivery.endpointId),
    index('webhook_deliveries_event_idx').on(delivery.eventId),
  ],
)

export type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect
export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect
