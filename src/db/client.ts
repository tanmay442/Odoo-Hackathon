import { drizzle } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema'

export type Database = NodePgDatabase<typeof schema>

let sharedPool: Pool | undefined
let sharedDatabase: Database | undefined

export function createDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString })
  return drizzle(pool, { schema })
}

export function getDatabase(): Database {
  if (sharedDatabase) return sharedDatabase
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  sharedPool = new Pool({ connectionString })
  sharedDatabase = drizzle(sharedPool, { schema })
  return sharedDatabase
}
