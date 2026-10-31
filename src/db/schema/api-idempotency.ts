import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { apiKeys } from './api-keys'

export const apiIdempotencyKeys = pgTable(
  'api_idempotency_keys',
  {
    key: text('key').notNull(),
    apiKeyId: uuid('api_key_id')
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'cascade' }),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (row) => [
    index('api_idempotency_key_lookup_idx').on(row.apiKeyId, row.key),
    unique('api_idempotency_key_unique').on(row.apiKeyId, row.key),
  ],
)

export type ApiIdempotencyKeyRow = typeof apiIdempotencyKeys.$inferSelect
