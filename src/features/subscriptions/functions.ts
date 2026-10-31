import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDatabase } from '../../db/client'
import { currentClerkUserId, guardServerFn } from '../../lib/auth'
import { InvalidTransitionError } from '../../domain/state-machines'
import { PlanUnavailableError } from '../plans/availability'
import { requireCustomerOwnerRecord, requireStaffRecord, resolveUserRecord } from '../users/guards'
import { SubscriptionValidationError, createSubscription, updateSubscriptionLines  } from './mutations'
import { subscriptionCreateSchema, subscriptionLinesUpdateSchema, subscriptionTransitionSchema, subscriptionStatusSchema  } from './schema'
import { transitionSubscription } from './transitions'
import { getSubscriptionDetail, listCustomerSubscriptions, listSubscriptions } from './queries'

function transitionFailure(error: unknown) {
  if (error instanceof InvalidTransitionError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    )
  }
  if (error instanceof SubscriptionValidationError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status })
  }
  if (error instanceof PlanUnavailableError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: 409 })
  }
  throw error
}

export const subscriptionListFn = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        status: subscriptionStatusSchema.optional(),
        customerId: z.uuid().optional(),
        page: z.number().optional(),
        pageSize: z.number().optional(),
      })
      .optional(),
  )
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireStaffRecord(database, await currentClerkUserId())
      return listSubscriptions(database, data ?? {})
    }),
  )

export const subscriptionGetFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const clerkUserId = await currentClerkUserId()
      const detail = await getSubscriptionDetail(database, data.id)
      if (!detail) return null
      await requireCustomerOwnerRecord(database, clerkUserId, detail.customerId)
      return detail
    }),
  )

export const subscriptionCreateFn = createServerFn({ method: 'POST' })
  .validator(subscriptionCreateSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireStaffRecord(database, await currentClerkUserId())
      try {
        return await createSubscription(database, actor, data)
      } catch (error) {
        return transitionFailure(error)
      }
    }),
  )

export const subscriptionUpdateLinesFn = createServerFn({ method: 'POST' })
  .validator(subscriptionLinesUpdateSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireStaffRecord(database, await currentClerkUserId())
      try {
        return await updateSubscriptionLines(database, actor, data.id, data.lines)
      } catch (error) {
        return transitionFailure(error)
      }
    }),
  )

export const subscriptionTransitionFn = createServerFn({ method: 'POST' })
  .validator(subscriptionTransitionSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const clerkUserId = await currentClerkUserId()
      const actor = await resolveUserRecord(database, clerkUserId)
      try {
        return await transitionSubscription(database, actor, data.id, data.to)
      } catch (error) {
        return transitionFailure(error)
      }
    }),
  )

export const customerSubscriptionsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ customerId: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const clerkUserId = await currentClerkUserId()
      await requireCustomerOwnerRecord(database, clerkUserId, data.customerId)
      return listCustomerSubscriptions(database, data.customerId)
    }),
  )
