import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const jobRuns = pgTable('job_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobName: text('job_name').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  summary: jsonb('summary').$type<Record<string, unknown> | null>(),
})

export type JobRunRow = typeof jobRuns.$inferSelect
