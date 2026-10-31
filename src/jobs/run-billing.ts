import { desc } from 'drizzle-orm'

import type { Database } from '../db/client'
import { getDatabase } from '../db/client'
import { jobRuns } from '../db/schema/job-runs'
import type { EmailPort } from '../ports/email-port'
import { queueExpiringSubscriptions, queueOverdueReminders } from '../features/email/scan'
import { generatePeriodInvoice } from '../features/invoices/mutations'
import { listDueSubscriptions } from '../features/invoices/queries'

export interface BillingJobSummary {
  scanned: number
  invoiced: number
  skippedAlreadyBilled: number
  closed: number
  truncated: boolean
  remindersQueued: number
  expiringQueued: number
  errors: Array<{ subscriptionId: string; message: string }>
}

const MAX_PERIODS_PER_SUBSCRIPTION = 100

export async function runBillingJobWithDatabase(
  database: Database,
  now: Date = new Date(),
  port?: EmailPort,
): Promise<BillingJobSummary> {
  const startedAt = new Date()
  const due = await listDueSubscriptions(database, now, 100)
  const summary: BillingJobSummary = {
    scanned: due.length,
    invoiced: 0,
    skippedAlreadyBilled: 0,
    closed: 0,
    truncated: due.length === 100,
    remindersQueued: 0,
    expiringQueued: 0,
    errors: [],
  }
  for (const dueSubscription of due) {
    for (let attempt = 0; attempt < MAX_PERIODS_PER_SUBSCRIPTION; attempt += 1) {
      let outcome: Awaited<ReturnType<typeof generatePeriodInvoice>>
      try {
        outcome = await generatePeriodInvoice(database, dueSubscription.id, now)
      } catch (error) {
        summary.errors.push({
          subscriptionId: dueSubscription.id,
          message: error instanceof Error ? error.message : 'Billing failed',
        })
        break
      }
      if (outcome.outcome === 'invoiced') {
        summary.invoiced += 1
        if (outcome.closed) summary.closed += 1
        if (outcome.closed) break
        continue
      }
      if (outcome.outcome === 'skippedAlreadyBilled') {
        summary.skippedAlreadyBilled += 1
        continue
      }
      break
    }
  }
  const reminders = await queueOverdueReminders(database, now, port)
  const expiring = await queueExpiringSubscriptions(database, now, port)
  summary.remindersQueued = reminders.queued
  summary.expiringQueued = expiring.queued
  await database.insert(jobRuns).values({
    jobName: 'run-billing',
    startedAt,
    finishedAt: new Date(),
    summary: summary as unknown as Record<string, unknown>,
  })
  return summary
}

// Single entry for the cron trigger, the admin button, and the secret API
// route. The database comes from the request environment; callers pass no
// connection string in tests and production wires Hyperdrive here.
export function runBillingJob(now: Date = new Date()): Promise<BillingJobSummary> {
  return runBillingJobWithDatabase(getDatabase(), now)
}

export async function latestJobRun(database: Database) {
  const rows = await database.query.jobRuns.findMany({
    orderBy: [desc(jobRuns.startedAt)],
    limit: 1,
  })
  if (rows.length === 0) return null
  return rows[0]
}
