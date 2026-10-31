import { desc, eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { apiKeys } from '../../db/schema/api-keys'

export function listApiKeys(database: Database) {
  return database.query.apiKeys.findMany({ orderBy: [desc(apiKeys.createdAt)] })
}

export function getApiKeyByHash(database: Database, keyHash: string) {
  return database.query.apiKeys.findFirst({ where: eq(apiKeys.keyHash, keyHash) })
}

export function getApiKey(database: Database, id: string) {
  return database.query.apiKeys.findFirst({ where: eq(apiKeys.id, id) })
}
