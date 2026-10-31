import { drizzle } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import type { Pool as PgPool, QueryResult } from 'pg'

import * as schema from './schema'

export type Database = NodePgDatabase<typeof schema>
export type BillingTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export type DbOrTx = Database | BillingTransaction

function openClient(connectionString: string): Client {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
  })
  client.on('error', () => undefined)
  return client
}

// Non-transactional queries open one connection per query and close it on
// release, so no socket is ever shared across requests. Transactional work
// opens one connection per transaction and holds it from BEGIN to COMMIT:
// sequential queries on that socket succeed in both Node and workerd, while
// a shared pool socket does not. The pooling cutover stays a Phase 10 task;
// this keeps one implementation for both runtimes.
class FreshConnectionPool {
  constructor(private connectionString: string) {}

  async query(text: string, params?: unknown[]): Promise<QueryResult> {
    const client = openClient(this.connectionString)
    await client.connect()
    try {
      return await client.query(text, params)
    } finally {
      await client.end().catch(() => undefined)
    }
  }

  async connect(): Promise<{ query: (text: string, params?: unknown[]) => Promise<QueryResult>; release: () => void }> {
    const client = openClient(this.connectionString)
    await client.connect()
    return {
      query: (text: string, params?: unknown[]) => client.query(text, params),
      release: () => {
        client.end().catch(() => undefined)
      },
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

export function getDatabase(connectionString?: string): Database {
  if (connectionString) return createDatabase(connectionString)
  if (sharedDatabase) return sharedDatabase
  const resolved = process.env.DATABASE_URL
  if (!resolved) throw new Error('DATABASE_URL is not set')
  sharedDatabase = createDatabase(resolved)
  return sharedDatabase
}
