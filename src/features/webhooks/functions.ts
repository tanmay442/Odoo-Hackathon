import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDatabase } from '../../db/client'
import { currentClerkUserId, guardServerFn } from '../../lib/auth'
import { requireAdminRecord } from '../users/guards'

import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  redeliverWebhook,
  setWebhookActive,
} from './mutations'
import { listWebhookDeliveries, listWebhookEndpoints } from './queries'
import { webhookCreateSchema, webhookDeleteSchema, webhookRedeliverSchema, webhookToggleSchema } from './schema'

function maskSecret(secret: string): string {
  if (secret.length <= 8) return '••••'
  return `••••${secret.slice(-4)}`
}

export const webhookListFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireAdminRecord(database, await currentClerkUserId())
    const rows = await listWebhookEndpoints(database)
    return rows.map((row) => ({ ...row, signingSecret: maskSecret(row.signingSecret) }))
  }),
)

export const webhookCreateFn = createServerFn({ method: 'POST' })
  .validator(webhookCreateSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return createWebhookEndpoint(database, actor, data)
    }),
  )

export const webhookToggleFn = createServerFn({ method: 'POST' })
  .validator(webhookToggleSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      const row = await setWebhookActive(database, actor, data.id, data.isActive)
      return { ...row, signingSecret: maskSecret(row.signingSecret) }
    }),
  )

export const webhookDeleteFn = createServerFn({ method: 'POST' })
  .validator(webhookDeleteSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      await deleteWebhookEndpoint(database, actor, data.id)
      return { deleted: true }
    }),
  )

export const webhookDeliveriesFn = createServerFn({ method: 'GET' })
  .validator(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireAdminRecord(database, await currentClerkUserId())
      return listWebhookDeliveries(database, data?.limit ?? 100)
    }),
  )

export const webhookRedeliverFn = createServerFn({ method: 'POST' })
  .validator(webhookRedeliverSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return redeliverWebhook(database, actor, data.deliveryId)
    }),
  )
