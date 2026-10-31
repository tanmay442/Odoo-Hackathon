import serverEntry from '@tanstack/react-start/server-entry'

import { createDatabase } from './db/client'
import { dispatchOutboxWithDatabase } from './jobs/dispatch-outbox'
import { runBillingJobWithDatabase } from './jobs/run-billing'

interface ScheduledEvent {
  scheduledTime: number
  cron: string
}

interface WorkerEnv {
  HYPERDRIVE?: { connectionString: string }
  JOB_SECRET?: string
  DATABASE_URL?: string
}

const handler = serverEntry as unknown as { fetch: typeof fetch }

// Request path reads DATABASE_URL via getDatabase(). Hyperdrive arrives
// as a binding object, so bridge it here: every request sees the same
// connection string, which makes the per-request assignment safe.
function fetchWithDatabase(request: Request, env: WorkerEnv): Promise<Response> {
  const connectionString =
    env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL ?? process.env.DATABASE_URL
  if (connectionString) process.env.DATABASE_URL = connectionString
  const workerFetch = handler.fetch as unknown as (request: Request, env: WorkerEnv) => Promise<Response>
  return workerFetch(request, env)
}

async function runScheduled(event: ScheduledEvent, env: WorkerEnv) {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL ?? process.env.DATABASE_URL
  if (!connectionString) return
  const database = createDatabase(connectionString)
  const at = new Date(event.scheduledTime)
  if (event.cron === '*/5 * * * *') {
    await dispatchOutboxWithDatabase(database, { now: at })
    return
  }
  await runBillingJobWithDatabase(database, at)
  await dispatchOutboxWithDatabase(database, { now: at })
}

export default {
  fetch: fetchWithDatabase,
  async scheduled(event: ScheduledEvent, env: WorkerEnv) {
    await runScheduled(event, env)
  },
}
