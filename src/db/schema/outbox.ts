import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const outboxStatus = pgEnum('outbox_status', ['pending', 'delivering', 'delivered', 'dead'])

export type OutboxStatus = (typeof outboxStatus.enumValues)[number]

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, string | null>>().notNull(),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (event) => [index('outbox_status_next_idx').on(event.status, event.nextAttemptAt)],
)

export type OutboxEventRow = typeof outboxEvents.$inferSelect
