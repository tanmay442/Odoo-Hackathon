import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { products } from './products'

export const billingInterval = pgEnum('billing_interval', [
  'daily',
  'weekly',
  'monthly',
  'yearly',
])

export type BillingInterval = (typeof billingInterval.enumValues)[number]

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    productId: uuid('product_id').references(() => products.id),
    priceMinor: bigint('price_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('INR'),
    billingInterval: billingInterval('billing_interval').notNull(),
    intervalCount: integer('interval_count').notNull().default(1),
    minQuantity: integer('min_quantity').notNull().default(1),
    availableFrom: timestamp('available_from', { withTimezone: true }),
    availableTo: timestamp('available_to', { withTimezone: true }),
    autoCloseAtEnd: boolean('auto_close_at_end').notNull().default(false),
    allowEarlyClose: boolean('allow_early_close').notNull().default(true),
    allowPause: boolean('allow_pause').notNull().default(true),
    allowRenew: boolean('allow_renew').notNull().default(true),
    priceChangedAt: timestamp('price_changed_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (plan) => [index('plans_product_id_idx').on(plan.productId)],
)

export type PlanRow = typeof plans.$inferSelect
export type NewPlanRow = typeof plans.$inferInsert
