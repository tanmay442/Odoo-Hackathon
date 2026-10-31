import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const emailJobStatus = pgEnum('email_job_status', ['queued', 'sent', 'failed'])

export type EmailJobStatus = (typeof emailJobStatus.enumValues)[number]

export const emailJobs = pgTable(
  'email_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    template: text('template').notNull(),
    recipient: text('recipient').notNull(),
    payload: jsonb('payload').$type<Record<string, string | number | null>>().notNull(),
    status: emailJobStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    providerId: text('provider_id'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (job) => [index('email_jobs_status_idx').on(job.status)],
)

export type EmailJobRow = typeof emailJobs.$inferSelect
