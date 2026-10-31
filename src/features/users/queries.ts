import { asc, eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { users } from '../../db/schema/users'

export function getUserByClerkId(database: Database, clerkUserId: string) {
  return database.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  })
}

export function getUserById(database: Database, userId: string) {
  return database.query.users.findFirst({
    where: eq(users.id, userId),
  })
}

export function listUsers(database: Database) {
  return database.query.users.findMany({
    orderBy: asc(users.createdAt),
  })
}
