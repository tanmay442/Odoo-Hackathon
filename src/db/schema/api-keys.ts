import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const apiKeyScopes = ['read', 'write', 'payments:verify'] as const

export type ApiKeyScope = (typeof apiKeyScopes)[number]

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    keyPrefix: text('key_prefix').notNull(),
    scopes: text('scopes').array().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (key) => [index('api_keys_hash_idx').on(key.keyHash)],
)

export type ApiKeyRow = typeof apiKeys.$inferSelect
