import { and, eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { apiIdempotencyKeys } from '../../db/schema/api-idempotency'
import type { ApiKeyRow, ApiKeyScope } from '../../db/schema/api-keys'
import { sha256Hex, touchApiKey } from './mutations'
import { getApiKeyByHash } from './queries'

// API-key auth is separate from Clerk UI auth: Bearer destr_live_* or
// x-api-key header. Revoked keys fail closed with 401 before scope checks.
export function extractRawKey(request: Request): string | null {
  const headerKey = request.headers.get('x-api-key')
  if (headerKey) return headerKey.trim()
  const authorization = request.headers.get('authorization')
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim()
  }
  return null
}

export type ApiAuthSuccess = { key: ApiKeyRow }

export type ApiAuthFailure = { status: 401 | 403; code: string; message: string }

function hasScope(scopes: string[], required: ApiKeyScope): boolean {
  if (scopes.includes(required)) return true
  if (required === 'read' && scopes.includes('write')) return true
  return false
}

export async function authenticateApiKey(
  database: Database,
  request: Request,
  requiredScope: ApiKeyScope,
): Promise<ApiAuthSuccess | ApiAuthFailure> {
  const raw = extractRawKey(request)
  if (!raw) return { status: 401, code: 'UNAUTHORIZED', message: 'Missing API key' }
  const keyHash = await sha256Hex(raw)
  const row = await getApiKeyByHash(database, keyHash)
  if (!row || row.revokedAt) {
    return { status: 401, code: 'UNAUTHORIZED', message: 'Invalid or revoked API key' }
  }
  if (!hasScope(row.scopes, requiredScope)) {
    return { status: 403, code: 'FORBIDDEN', message: 'API key lacks the required scope' }
  }
  await touchApiKey(database, row.id)
  return { key: row }
}

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return Response.json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, { status })
}

export async function readIdempotentResponse(database: Database, apiKeyId: string, idempotencyKey: string | null) {
  if (!idempotencyKey) return null
  return database.query.apiIdempotencyKeys.findFirst({
    where: and(eq(apiIdempotencyKeys.apiKeyId, apiKeyId), eq(apiIdempotencyKeys.key, idempotencyKey)),
  })
}

export async function storeIdempotentResponse(
  database: Database,
  apiKeyId: string,
  idempotencyKey: string,
  status: number,
  body: unknown,
) {
  try {
    await database.insert(apiIdempotencyKeys).values({
      key: idempotencyKey,
      apiKeyId,
      responseStatus: status,
      responseBody: body,
    })
  } catch (error) {
    if (isIdempotencyConflict(error)) return
    throw error
  }
}

function isIdempotencyConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  if (code === '23505') return true
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && message.includes('api_idempotency_key_unique')
}

export function idempotencyKeyFor(request: Request): string | null {
  const key = request.headers.get('idempotency-key')
  if (!key) return null
  const trimmed = key.trim()
  return trimmed === '' ? null : trimmed
}
