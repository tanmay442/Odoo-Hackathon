import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { apiKeys } from '../../db/schema/api-keys'
import type { ApiKeyScope } from '../../db/schema/api-keys'
import type { UserRow } from '../../db/schema/users'
import { assertAdminRole } from '../../lib/auth'

export const apiKeyPrefix = 'destr_live_'

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function randomSuffix(bytes = 24): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function createApiKey(
  database: Database,
  actor: UserRow,
  input: { name: string; scopes: ApiKeyScope[] },
) {
  assertAdminRole(actor.role)
  const plainKey = `${apiKeyPrefix}${randomSuffix()}`
  const keyHash = await sha256Hex(plainKey)
  const inserted = await database
    .insert(apiKeys)
    .values({
      name: input.name.trim(),
      keyHash,
      keyPrefix: plainKey.slice(0, 16),
      scopes: [...input.scopes],
      createdBy: actor.id,
    })
    .returning()
  if (inserted.length === 0) throw new Error('API key insert lost its row')
  return { row: inserted[0], plainKey }
}

export async function revokeApiKey(database: Database, actor: UserRow, keyId: string) {
  assertAdminRole(actor.role)
  const updated = await database
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId))
    .returning()
  if (updated.length === 0) throw new Error('API key is gone')
  return updated[0]
}

export function touchApiKey(database: Database, keyId: string) {
  return database
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, keyId))
}
