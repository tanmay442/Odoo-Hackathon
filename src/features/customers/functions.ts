import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDatabase } from '../../db/client'
import { currentClerkUserId, guardServerFn } from '../../lib/auth'
import { requireCustomerOwnerRecord, requireStaffRecord } from '../users/guards'

import { archiveCustomer, createCustomer, restoreCustomer, staffUpdateCustomer, updateCustomer } from './mutations'
import { getCustomer, listCustomers } from './queries'
import { customerSchema, updateCustomerSchema } from './schema'

export const customerListFn = createServerFn({ method: 'GET' })
  .validator(z.object({ search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireStaffRecord(database, await currentClerkUserId())
      return listCustomers(database, data ?? {})
    }),
  )

export const customerGetFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const clerkUserId = await currentClerkUserId()
      const record = await getCustomer(database, data.id)
      if (!record) return null
      await requireCustomerOwnerRecord(database, clerkUserId, data.id)
      return record
    }),
  )

export const customerCreateFn = createServerFn({ method: 'POST' })
  .validator(customerSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireStaffRecord(database, await currentClerkUserId())
      return createCustomer(database, actor, data)
    }),
  )

export const customerUpdateFn = createServerFn({ method: 'POST' })
  .validator(updateCustomerSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireStaffRecord(database, await currentClerkUserId())
      return staffUpdateCustomer(database, actor, data)
    }),
  )

export const customerArchiveFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireStaffRecord(database, await currentClerkUserId())
      try {
        return await archiveCustomer(database, actor, data.id)
      } catch (error) {
        if (error instanceof Error && error.name === 'ForbiddenError') {
          return Response.json({ error: { code: 'CUSTOMER_HAS_SUBSCRIPTIONS', message: 'Customer with subscriptions cannot be deleted' } }, { status: 409 })
        }
        throw error
      }
    }),
  )

export const customerRestoreFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const { requireAdminRecord } = await import('../users/guards')
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return restoreCustomer(database, actor, data.id)
    }),
  )

export const portalAccountFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    const clerkUserId = await currentClerkUserId()
    const { resolveUserRecord } = await import('../users/guards')
    const user = await resolveUserRecord(database, clerkUserId)
    if (!user.customerId) return null
    return getCustomer(database, user.customerId)
  }),
)

export const portalAccountUpdateFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      displayName: z.string().trim().min(1).max(200).optional(),
      email: z.email().optional(),
      phone: z.string().trim().max(50).nullish(),
      billingAddress: z.string().trim().max(2000).nullish(),
      notes: z.string().trim().max(2000).nullish(),
    }),
  )
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const clerkUserId = await currentClerkUserId()
      const { resolveUserRecord } = await import('../users/guards')
      const user = await resolveUserRecord(database, clerkUserId)
      if (!user.customerId) throw new Error('No customer linked')
      return updateCustomer(database, user, user.customerId, { id: user.customerId, ...data })
    }),
  )
