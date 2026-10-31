import { ZodError } from 'zod'

import type { Database } from '../../db/client'
import type { ApiKeyRow, ApiKeyScope } from '../../db/schema/api-keys'
import type { UserRow } from '../../db/schema/users'
import { ForbiddenError } from '../../lib/auth'
import { getDatabase } from '../../db/client'

import {
  apiError,
  authenticateApiKey,
  idempotencyKeyFor,
  readIdempotentResponse,
  storeIdempotentResponse,
} from '../api-keys/auth'

export function apiActor(row: ApiKeyRow, scope: ApiKeyScope): UserRow {
  // API keys are admin-issued delegations: write implies the admin-only
  // mutations (catalog), read and payments:verify map to staff-level use.
  return {
    id: `api-key:${row.id}`,
    clerkUserId: `api-key:${row.id}`,
    email: `api-key:${row.id}@internal`,
    role: scope === 'read' ? 'staff' : 'admin',
    customerId: null,
    isSeedAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function errorStatus(error: unknown): number {
  if (error instanceof ForbiddenError) return error.status
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return error.status
  }
  return 500
}

function errorCode(error: unknown): string {
  if (error instanceof ForbiddenError) return 'FORBIDDEN'
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code.length > 0
  ) {
    return error.code
  }
  return 'INTERNAL'
}

function toErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return apiError(400, 'INVALID_INPUT', 'Request validation failed', error.issues)
  }
  const status = errorStatus(error)
  if (status === 500) {
    console.error(
      JSON.stringify({
        event: 'api.error',
        code: errorCode(error),
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    )
    return apiError(500, 'INTERNAL', 'Something went wrong')
  }
  const message = error instanceof Error ? error.message : 'Request failed'
  return apiError(status, errorCode(error), message)
}

export function withoutCostPrice<T extends { costPriceMinor?: unknown }>(row: T): Omit<T, 'costPriceMinor'> {
  const clone = { ...row }
  delete clone.costPriceMinor
  return clone
}

export async function handleApiRead(
  request: Request,
  scope: ApiKeyScope,
  work: (database: Database, actor: UserRow) => Promise<unknown>,
): Promise<Response> {
  try {
    const database = getDatabase()
    const auth = await authenticateApiKey(database, request, scope)
    if ('status' in auth) return apiError(auth.status, auth.code, auth.message)
    const data = await work(database, apiActor(auth.key, scope))
    return Response.json({ data })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function handleApiWrite(
  request: Request,
  scope: ApiKeyScope,
  work: (database: Database, actor: UserRow) => Promise<{ body: unknown; status?: number }>,
): Promise<Response> {
  try {
    const database = getDatabase()
    const auth = await authenticateApiKey(database, request, scope)
    if ('status' in auth) return apiError(auth.status, auth.code, auth.message)
    const idempotencyKey = idempotencyKeyFor(request)
    if (idempotencyKey) {
      const stored = await readIdempotentResponse(database, auth.key.id, idempotencyKey)
      if (stored) {
        return Response.json(stored.responseBody, { status: stored.responseStatus })
      }
    }
    const { body, status } = await work(database, apiActor(auth.key, scope))
    const responseStatus = status ?? 200
    if (idempotencyKey && responseStatus < 300) {
      await storeIdempotentResponse(database, auth.key.id, idempotencyKey, responseStatus, body)
    }
    return Response.json(body, { status: responseStatus })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw Object.assign(new Error('Request body is not valid JSON'), {
      status: 400,
      code: 'INVALID_JSON',
    })
  }
}
