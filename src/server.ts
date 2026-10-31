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
  fetch: handler.fetch,
  async scheduled(event: ScheduledEvent, env: WorkerEnv) {
    await runScheduled(event, env)
  },
}
