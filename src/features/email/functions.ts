import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDatabase } from '../../db/client'
import { emailJobs } from '../../db/schema/email-jobs'
import { currentClerkUserId, guardServerFn } from '../../lib/auth'
import { eq } from 'drizzle-orm'
import { requireAdminRecord } from '../users/guards'
import { listEmailJobs } from './queries'

export const emailLogFn = createServerFn({ method: 'GET' })
  .validator(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireAdminRecord(database, await currentClerkUserId())
      return listEmailJobs(database, data?.limit ?? 100)
    }),
  )

export const emailRetryFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireAdminRecord(database, await currentClerkUserId())
      const updated = await database
        .update(emailJobs)
        .set({ status: 'queued', attempts: 0, lastError: null })
        .where(eq(emailJobs.id, data.id))
        .returning()
      return updated[0] ?? null
    }),
  )
