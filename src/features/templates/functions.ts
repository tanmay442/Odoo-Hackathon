import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDatabase } from '../../db/client'
import { currentClerkUserId, guardServerFn } from '../../lib/auth'
import { requireAdminRecord, requireStaffRecord } from '../users/guards'

import { createTemplate, deleteTemplate, updateTemplate } from './mutations'
import { getTemplateWithLines, listActiveTemplates, listTemplates } from './queries'
import { templateSchema, updateTemplateSchema } from './schema'

export const templateListFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireStaffRecord(database, await currentClerkUserId())
    return listTemplates(database)
  }),
)

export const templateActiveFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireStaffRecord(database, await currentClerkUserId())
    return listActiveTemplates(database)
  }),
)

export const templateGetFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireStaffRecord(database, await currentClerkUserId())
      return getTemplateWithLines(database, data.id)
    }),
  )

export const templateCreateFn = createServerFn({ method: 'POST' })
  .validator(templateSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return createTemplate(database, actor, data)
    }),
  )

export const templateUpdateFn = createServerFn({ method: 'POST' })
  .validator(updateTemplateSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return updateTemplate(database, actor, data)
    }),
  )

export const templateDeleteFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      await deleteTemplate(database, actor, data.id)
      return { deleted: true }
    }),
  )
