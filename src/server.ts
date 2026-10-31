import serverEntry from '@tanstack/react-start/server-entry'

import { createDatabase } from './db/client'
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
  await runBillingJobWithDatabase(database, new Date(event.scheduledTime))
}

export default {
  fetch: handler.fetch,
  async scheduled(event: ScheduledEvent, env: WorkerEnv) {
    await runScheduled(event, env)
  },
}
