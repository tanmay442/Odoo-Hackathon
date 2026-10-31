import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getDatabase } from '../../db/client'
import { effectiveVariantPrice } from '../../domain/money'
import { currentClerkUserId, guardServerFn } from '../../lib/auth'
import { requireAdminRecord, requireStaffRecord } from '../users/guards'

import {
  createProduct,
  createVariant,
  deleteProduct,
  deleteVariant,
  restoreProduct,
  updateProduct,
  updateVariant,
} from './mutations'
import { listProducts, listVariants } from './queries'
import {
  productSchema,
  updateProductSchema,
  updateVariantSchema,
  variantSchema,
} from './schema'

export const productListFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireStaffRecord(database, await currentClerkUserId())
    return listProducts(database)
  }),
)

export const productPickerFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireStaffRecord(database, await currentClerkUserId())
    const rows = await listProducts(database)
    const visible = rows.filter((row) => row.archivedAt === null)
    return Promise.all(
      visible.map(async (row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        salesPriceMinor: row.salesPriceMinor,
        currency: row.currency,
        variants: (await listVariants(database, row.id)).map((variant) => ({
          id: variant.id,
          name: variant.name,
          priceDeltaMinor: variant.priceDeltaMinor,
          effectivePriceMinor: effectiveVariantPrice(row.salesPriceMinor, variant.priceDeltaMinor),
        })),
      })),
    )
  }),
)

export const productCreateFn = createServerFn({ method: 'POST' })
  .validator(productSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return createProduct(database, actor, data)
    }),
  )

export const productUpdateFn = createServerFn({ method: 'POST' })
  .validator(updateProductSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return updateProduct(database, actor, data)
    }),
  )

export const productDeleteFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return deleteProduct(database, actor, data.id)
    }),
  )

export const productRestoreFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return restoreProduct(database, actor, data.id)
    }),
  )

export const variantListFn = createServerFn({ method: 'GET' })
  .validator(z.object({ productId: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireStaffRecord(database, await currentClerkUserId())
      return listVariants(database, data.productId)
    }),
  )

export const variantCreateFn = createServerFn({ method: 'POST' })
  .validator(variantSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return createVariant(database, actor, data)
    }),
  )

export const variantUpdateFn = createServerFn({ method: 'POST' })
  .validator(updateVariantSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return updateVariant(database, actor, data)
    }),
  )

export const variantDeleteFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      await deleteVariant(database, actor, data.id)
      return { deleted: true }
    }),
  )
