import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDatabase } from '../../db/client'
import { ForbiddenError, currentClerkUserId, guardServerFn } from '../../lib/auth'
import { requireAdminRecord, requireStaffRecord } from '../users/guards'

import { isPlanAvailableForNewSubscription } from './availability'
import { createPlan, deletePlan, restorePlan, updatePlan } from './mutations'
import { getPlan, listPlans } from './queries'
import { planSchema, updatePlanSchema } from './schema'

export const planListFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireStaffRecord(database, await currentClerkUserId())
    return listPlans(database)
  }),
)

export const planPickerFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireStaffRecord(database, await currentClerkUserId())
    const now = new Date()
    const rows = await listPlans(database)
    return rows
      .filter((row) => isPlanAvailableForNewSubscription(row, now))
      .map((row) => ({
        id: row.id,
        name: row.name,
        priceMinor: row.priceMinor,
        currency: row.currency,
        billingInterval: row.billingInterval,
        intervalCount: row.intervalCount,
        minQuantity: row.minQuantity,
      }))
  }),
)

export const planAvailabilityFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireStaffRecord(database, await currentClerkUserId())
      const plan = await getPlan(database, data.id)
      if (!plan) throw new ForbiddenError()
      return { available: isPlanAvailableForNewSubscription(plan, new Date()) }
    }),
  )

export const planCreateFn = createServerFn({ method: 'POST' })
  .validator(planSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return createPlan(database, actor, data)
    }),
  )

export const planUpdateFn = createServerFn({ method: 'POST' })
  .validator(updatePlanSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return updatePlan(database, actor, data)
    }),
  )

export const planDeleteFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return deletePlan(database, actor, data.id)
    }),
  )

export const planRestoreFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return restorePlan(database, actor, data.id)
    }),
  )
