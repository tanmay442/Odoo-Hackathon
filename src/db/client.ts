import { drizzle } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import type { Pool as PgPool, QueryResult } from 'pg'

import * as schema from './schema'

export type Database = NodePgDatabase<typeof schema>

// workerd dev drops the second and later responses on a reused pg socket:
// every reused connection hangs until the query timeout, while a fresh
// connection answers in milliseconds. This pool therefore opens one
// connection per query and closes it on release, so no socket is ever
// reused. Concurrent requests each get their own socket instead of racing
// on one. Only non-transactional queries are supported; the production
// Hyperdrive driver (phase 10) replaces this client before transactions
// are needed.
class FreshConnectionPool {
  constructor(private connectionString: string) {}

  async query(text: string, params?: unknown[]): Promise<QueryResult> {
    const client = new Client({
      connectionString: this.connectionString,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    })
    await client.connect()
    try {
      return await client.query(text, params)
    } finally {
      await client.end().catch(() => undefined)
    }
  }

  on() {
    return this
  }
}

let sharedDatabase: Database | undefined

export function createDatabase(connectionString: string): Database {
  return drizzle(new FreshConnectionPool(connectionString) as unknown as PgPool, { schema })
}

export function getDatabase(): Database {
  if (sharedDatabase) return sharedDatabase
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  sharedDatabase = createDatabase(connectionString)
  return sharedDatabase
}
