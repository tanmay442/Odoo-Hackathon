import { bigint, boolean, check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { products } from './products'
import { subscriptions } from './subscriptions'

export const discountKind = pgEnum('discount_kind', ['fixed', 'percentage'])

export type DiscountKind = (typeof discountKind.enumValues)[number]

export const discountScope = pgEnum('discount_scope', ['product', 'subscription'])

export type DiscountScope = (typeof discountScope.enumValues)[number]

export const discounts = pgTable(
  'discounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    kind: discountKind('kind').notNull(),
    valueMinorOrBasisPoints: bigint('value_minor_or_basis_points', { mode: 'number' }).notNull(),
    minPurchaseMinor: bigint('min_purchase_minor', { mode: 'number' }),
    minQuantity: integer('min_quantity'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    maxRedemptions: integer('max_redemptions'),
    timesRedeemed: integer('times_redeemed').notNull().default(0),
    scope: discountScope('scope').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (discount) => [
    index('discounts_scope_active_idx').on(discount.scope, discount.isActive),
    // Cap and window guards run in one atomic UPDATE...WHERE; the index
    // keeps that claim scan off the full table.
    index('discounts_redeemable_idx').on(discount.isActive, discount.timesRedeemed),
    index('discounts_kind_idx').on(discount.kind),
    check('discounts_value_non_negative', sql`value_minor_or_basis_points >= 0`),
    check('discounts_times_redeemed_non_negative', sql`times_redeemed >= 0`),
  ],
)

export const discountProducts = pgTable(
  'discount_products',
  {
    discountId: uuid('discount_id')
      .notNull()
      .references(() => discounts.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
  },
  (link) => [
    primaryKey({ columns: [link.discountId, link.productId] }),
    index('discount_products_product_id_idx').on(link.productId),
  ],
)

export const subscriptionDiscounts = pgTable(
  'subscription_discounts',
  {
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    discountId: uuid('discount_id')
      .notNull()
      .references(() => discounts.id),
    attachedBy: text('attached_by').notNull(),
    attachedAt: timestamp('attached_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (link) => [
    primaryKey({ columns: [link.subscriptionId, link.discountId] }),
    index('subscription_discounts_discount_id_idx').on(link.discountId),
  ],
)

export type DiscountRow = typeof discounts.$inferSelect
export type NewDiscountRow = typeof discounts.$inferInsert
export type DiscountProductRow = typeof discountProducts.$inferSelect
export type SubscriptionDiscountRow = typeof subscriptionDiscounts.$inferSelect
