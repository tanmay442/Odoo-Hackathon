import { auth } from '@clerk/tanstack-react-start/server'

import type { UserRole } from '../db/schema/users'

// Identity lives in Clerk; roles live in our DB (this file is the gate).
// Clerk dashboard password policy (problem-statement rule): more than 8
// characters, at least one uppercase, one lowercase, and one special.

export type StaffRole = Extract<UserRole, 'admin' | 'staff'>

export class ForbiddenError extends Error {
  readonly status = 403

  constructor() {
    super('Forbidden')
    this.name = 'ForbiddenError'
  }
}

export class UnauthorizedError extends Error {
  readonly status = 401

  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

export function toHttpResponse(error: ForbiddenError | UnauthorizedError): Response {
  return Response.json({ error: error.message }, { status: error.status })
}

export function assertAdminRole(role: UserRole): void {
  if (!canActAsAdmin(role)) throw new ForbiddenError()
}

// Single boundary for server-function failures: known auth errors map to
// their status, everything else becomes a generic 500 with no internals.
export async function guardServerFn<T>(work: () => Promise<T>): Promise<T | Response> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthorizedError) {
      return toHttpResponse(error)
    }
    console.error('Unhandled server function error', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}

interface RoleGate {
  admin: boolean
  staff: boolean
}

const roleGates: Record<UserRole, RoleGate> = {
  admin: { admin: true, staff: true },
  staff: { admin: false, staff: true },
  customer: { admin: false, staff: false },
}

export function canActAsAdmin(role: UserRole): boolean {
  return roleGates[role].admin
}

export function canActAsStaff(role: UserRole): boolean {
  return roleGates[role].staff
}

export function canOwnCustomer(role: UserRole, customerId: string | null, targetCustomerId: string): boolean {
  if (canActAsStaff(role)) return true
  return customerId !== null && customerId === targetCustomerId
}

export function landingPathForRole(role: UserRole): string {
  return canActAsStaff(role) ? '/app' : '/portal'
}

export async function currentClerkUserId(): Promise<string> {
  const session = await auth()
  if (!session.userId) throw new UnauthorizedError()
  return session.userId
}
