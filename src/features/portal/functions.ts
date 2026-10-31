import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import type { Database } from '../../db/client'
import { getDatabase } from '../../db/client'
import { currentClerkUserId, ForbiddenError, guardServerFn } from '../../lib/auth'
import { resolveUserRecord } from '../users/guards'
import { listCustomerInvoices } from '../invoices/queries'
import { listCustomerSubscriptions } from '../subscriptions/queries'

import { getPortalInvoice, getPortalOverview, getPortalSubscription } from './queries'
import { portalListSchema } from './schema'

async function requirePortalCustomerId(database: Database): Promise<string> {
  const user = await resolveUserRecord(database, await currentClerkUserId())
  if (!user.customerId) throw new ForbiddenError()
  return user.customerId
}

export const portalOverviewFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    return getPortalOverview(database, await requirePortalCustomerId(database))
  }),
)

export const portalSubscriptionsFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    return listCustomerSubscriptions(database, await requirePortalCustomerId(database))
  }),
)

export const portalSubscriptionFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const customerId = await requirePortalCustomerId(database)
      return getPortalSubscription(database, customerId, data.id)
    }),
  )

export const portalInvoicesFn = createServerFn({ method: 'GET' })
  .validator(portalListSchema.optional())
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const customerId = await requirePortalCustomerId(database)
      const page = Math.max(1, data?.page ?? 1)
      const pageSize = Math.min(100, Math.max(1, data?.pageSize ?? 20))
      const rows = await listCustomerInvoices(database, customerId)
      return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize }
    }),
  )

export const portalInvoiceFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const customerId = await requirePortalCustomerId(database)
      return getPortalInvoice(database, customerId, data.id)
    }),
  )
