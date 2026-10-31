import { drizzle } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema'

export type Database = NodePgDatabase<typeof schema>
export type BillingTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export type DbOrTx = Database | BillingTransaction

// One shared pool per connection string: sockets are reused across queries
// instead of paying a TLS handshake per query (the pre-Phase-10 behavior
// that put every list page over budget against Neon). pg Pool works in both
// Node and workerd (Hyperdrive connection string); transactions check out
// one socket from BEGIN to COMMIT. Pool size stays small: the Worker runs
// many isolates, and Hyperdrive/Neon pool the rest.
const pools = new Map<string, InstanceType<typeof Pool>>()

function sharedPool(connectionString: string): InstanceType<typeof Pool> {
  const existing = pools.get(connectionString)
  if (existing) return existing
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  })
  pool.on('error', () => undefined)
  pools.set(connectionString, pool)
  return pool
}

let sharedDatabase: Database | undefined

export function createDatabase(connectionString: string): Database {
  return drizzle(sharedPool(connectionString), { schema })
}

export function getDatabase(connectionString?: string): Database {
  if (connectionString) return createDatabase(connectionString)
  if (sharedDatabase) return sharedDatabase
  const resolved = process.env.DATABASE_URL
  if (!resolved) throw new Error('DATABASE_URL is not set')
  sharedDatabase = createDatabase(resolved)
  return sharedDatabase
}
