import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDatabase } from '../../db/client'
import { currentClerkUserId, guardServerFn } from '../../lib/auth'
import { requireAdminRecord, requireStaffRecord } from '../users/guards'

import { createTax, deleteTax, restoreTax, updateTax } from './mutations'
import { listTaxes } from './queries'
import { taxSchema, updateTaxSchema } from './schema'

export const taxListFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireStaffRecord(database, await currentClerkUserId())
    return listTaxes(database)
  }),
)

export const taxPickerFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireStaffRecord(database, await currentClerkUserId())
    const rows = await listTaxes(database)
    return rows
      .filter((row) => row.isActive)
      .map((row) => ({ id: row.id, name: row.name, rateBasisPoints: row.rateBasisPoints }))
  }),
)

export const taxCreateFn = createServerFn({ method: 'POST' })
  .validator(taxSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return createTax(database, actor, data)
    }),
  )

export const taxUpdateFn = createServerFn({ method: 'POST' })
  .validator(updateTaxSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return updateTax(database, actor, data)
    }),
  )

export const taxDeleteFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      await deleteTax(database, actor, data.id)
      return { deleted: true }
    }),
  )

export const taxRestoreFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return restoreTax(database, actor, data.id)
    }),
  )
