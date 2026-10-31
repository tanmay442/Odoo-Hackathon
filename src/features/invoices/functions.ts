import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDatabase } from '../../db/client'
import { currentClerkUserId, guardServerFn } from '../../lib/auth'
import { latestJobRun, runBillingJobWithDatabase } from '../../jobs/run-billing'
import { dispatchOutboxWithDatabase } from '../../jobs/dispatch-outbox'
import type { BillingJobSummary } from '../../jobs/run-billing'
import { requireAdminRecord, requireStaffRecord } from '../users/guards'

import { cancelInvoice, confirmInvoice, sendInvoice } from './mutations'
import { getInvoiceDetail, listDueSubscriptions, listInvoices } from './queries'
import { invoiceCancelSchema, invoiceListSchema } from './schema'

export const invoiceListFn = createServerFn({ method: 'GET' })
  .validator(invoiceListSchema.optional())
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireStaffRecord(database, await currentClerkUserId())
      return listInvoices(database, data ?? {})
    }),
  )

export const invoiceGetFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireStaffRecord(database, await currentClerkUserId())
      const detail = await getInvoiceDetail(database, data.id)
      if (!detail) return null
      return detail
    }),
  )

export const invoiceConfirmFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireStaffRecord(database, await currentClerkUserId())
      return confirmInvoice(database, actor, data.id)
    }),
  )

export const invoiceCancelFn = createServerFn({ method: 'POST' })
  .validator(invoiceCancelSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireStaffRecord(database, await currentClerkUserId())
      return cancelInvoice(database, actor, data.id, data.reason)
    }),
  )

export const invoiceSendFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireStaffRecord(database, await currentClerkUserId())
      return sendInvoice(database, actor, data.id)
    }),
  )

export const billingRunFn = createServerFn({ method: 'POST' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireAdminRecord(database, await currentClerkUserId())
    const summary = await runBillingJobWithDatabase(database, new Date())
    await dispatchOutboxWithDatabase(database)
    return summary
  }),
)

export const billingStatusFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireAdminRecord(database, await currentClerkUserId())
    const [latest, due] = await Promise.all([
      latestJobRun(database),
      listDueSubscriptions(database, new Date(), 100),
    ])
    return {
      latest: latest
        ? {
            id: latest.id,
            jobName: latest.jobName,
            startedAt: latest.startedAt,
            finishedAt: latest.finishedAt,
            summary: latest.summary as unknown as BillingJobSummary | null,
          }
        : null,
      dueCount: due.length,
    }
  }),
)
