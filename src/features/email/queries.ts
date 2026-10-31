import { desc } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { emailJobs } from '../../db/schema/email-jobs'

export function listEmailJobs(database: Database, limit = 100) {
  return database.query.emailJobs.findMany({
    orderBy: [desc(emailJobs.createdAt)],
    limit: Math.min(100, Math.max(1, limit)),
  })
}
