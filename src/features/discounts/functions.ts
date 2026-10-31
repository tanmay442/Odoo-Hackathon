import { createServerFn } from '@tanstack/react-start'
import { inArray } from 'drizzle-orm'
import { z } from 'zod'

import { getDatabase } from '../../db/client'
import { discounts } from '../../db/schema/discounts'
import { currentClerkUserId, guardServerFn } from '../../lib/auth'
import { requireAdminRecord, requireCustomerOwnerRecord, requireStaffRecord } from '../users/guards'
import { getSubscription } from '../subscriptions/queries'

import { findApplicableDiscounts } from './applicability'
import {
  attachDiscount,
  createDiscount,
  deleteDiscount,
  detachDiscount,
  updateDiscount,
} from './mutations'
import { buildNextInvoicePreview } from './preview'
import {
  getDiscount,
  listDiscountProducts,
  listDiscounts,
  listSubscriptionDiscountRows,
} from './queries'
import { discountAttachSchema, discountSchema, updateDiscountSchema } from './schema'

export const discountListFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireAdminRecord(database, await currentClerkUserId())
    return listDiscounts(database)
  }),
)

export const discountPickerFn = createServerFn({ method: 'GET' }).handler(() =>
  guardServerFn(async () => {
    const database = getDatabase()
    await requireStaffRecord(database, await currentClerkUserId())
    const rows = await listDiscounts(database)
    const visible = rows.filter((row) => row.isActive)
    return Promise.all(
      visible.map(async (row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        valueMinorOrBasisPoints: row.valueMinorOrBasisPoints,
        scope: row.scope,
        productIds: (await listDiscountProducts(database, row.id)).map((link) => link.productId),
      })),
    )
  }),
)

export const discountGetFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      await requireAdminRecord(database, await currentClerkUserId())
      const row = await getDiscount(database, data.id)
      if (!row) return null
      const productIds = (await listDiscountProducts(database, row.id)).map(
        (link) => link.productId,
      )
      return { ...row, productIds }
    }),
  )

export const discountCreateFn = createServerFn({ method: 'POST' })
  .validator(discountSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return createDiscount(database, actor, data)
    }),
  )

export const discountUpdateFn = createServerFn({ method: 'POST' })
  .validator(updateDiscountSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      return updateDiscount(database, actor, data)
    }),
  )

export const discountDeleteFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireAdminRecord(database, await currentClerkUserId())
      await deleteDiscount(database, actor, data.id)
      return { deleted: true }
    }),
  )

export const discountAttachFn = createServerFn({ method: 'POST' })
  .validator(discountAttachSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireStaffRecord(database, await currentClerkUserId())
      await attachDiscount(database, actor, data)
      return { attached: true }
    }),
  )

export const discountDetachFn = createServerFn({ method: 'POST' })
  .validator(discountAttachSchema)
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const actor = await requireStaffRecord(database, await currentClerkUserId())
      await detachDiscount(database, actor, data)
      return { detached: true }
    }),
  )

export const subscriptionDiscountsFn = createServerFn({ method: 'GET' })
  .validator(z.object({ subscriptionId: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const subscription = await getSubscription(database, data.subscriptionId)
      if (!subscription) return null
      await requireCustomerOwnerRecord(database, await currentClerkUserId(), subscription.customerId)
      return listSubscriptionDiscountRows(database, data.subscriptionId)
    }),
  )

export const subscriptionPreviewFn = createServerFn({ method: 'GET' })
  .validator(z.object({ subscriptionId: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const subscription = await getSubscription(database, data.subscriptionId)
      if (!subscription) return null
      await requireCustomerOwnerRecord(database, await currentClerkUserId(), subscription.customerId)
      return buildNextInvoicePreview(database, data.subscriptionId)
    }),
  )

export const subscriptionApplicableFn = createServerFn({ method: 'GET' })
  .validator(z.object({ subscriptionId: z.uuid() }))
  .handler(({ data }) =>
    guardServerFn(async () => {
      const database = getDatabase()
      const subscription = await getSubscription(database, data.subscriptionId)
      if (!subscription) return null
      await requireCustomerOwnerRecord(database, await currentClerkUserId(), subscription.customerId)
      const context = await findApplicableDiscounts(database, data.subscriptionId)
      if (context.discounts.length === 0) return []
      const rows = await database.query.discounts.findMany({
        where: inArray(
          discounts.id,
          context.discounts.map((discount) => discount.id),
        ),
      })
      return rows
    }),
  )
