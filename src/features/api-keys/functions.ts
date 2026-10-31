import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDatabase } from '../../db/client'
import { currentClerkUserId, guardServerFn } from '../../lib/auth'
import { requireAdminRecord } from '../users/guards'

import { createApiKey, revokeApiKey } from './mutations'
import { listApiKeys } from './queries'
import { apiKeyCreateSchema } from './schema'

export const apiKeyListFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireAdminRecord(database, await currentClerkUserId())
    const rows = await listApiKeys(database)
    return rows.map(({ keyHash: _hash, ...visible }) => visible)
  }),
)

export const apiKeyCreateFn = createServerFn({ method: 'POST' })
  .validator(apiKeyCreateSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return createApiKey(database, actor, data)
    }),
  )

export const apiKeyRevokeFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return revokeApiKey(database, actor, data.id)
    }),
  )
