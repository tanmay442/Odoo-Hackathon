import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../../db/client'
import { currentClerkUserId, guardServerFn } from '../../lib/auth'
import { requireStaffRecord } from '../users/guards'

import { queueChaseEmail } from './mutations'
import { listOverdueInvoices } from './overdue'
import { getDashboardSummary } from './queries'
import { dashboardChaseSchema, dashboardFilterSchema, dashboardOverdueSchema } from './schema'

export const dashboardSummaryFn = createServerFn({ method: 'GET' })
  .validator(dashboardFilterSchema.optional())
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireStaffRecord(database, await currentClerkUserId())
      return getDashboardSummary(database, data ?? {})
    }),
  )

export const dashboardOverdueFn = createServerFn({ method: 'GET' })
  .validator(dashboardOverdueSchema.optional())
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireStaffRecord(database, await currentClerkUserId())
      return listOverdueInvoices(database, data ?? {})
    }),
  )

export const dashboardChaseFn = createServerFn({ method: 'POST' })
  .validator(dashboardChaseSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const staff = await requireStaffRecord(database, await currentClerkUserId())
      return queueChaseEmail(database, staff, data.invoiceId)
    }),
  )
