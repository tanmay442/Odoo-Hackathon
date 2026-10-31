import { bigint, check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { customers } from './customers'
import { plans } from './plans'
import { products, productVariants } from './products'
import { quotationTemplates } from './templates'
import { taxes } from './taxes'

export const subscriptionStatus = pgEnum('subscription_status', [
  'draft',
  'quotation',
  'confirmed',
  'active',
  'paused',
  'closed',
])

export type SubscriptionStatus = (typeof subscriptionStatus.enumValues)[number]

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatus('status').notNull().default('draft'),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    expiryDate: timestamp('expiry_date', { withTimezone: true }).notNull(),
    paymentTerms: text('payment_terms'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    nextBillingAt: timestamp('next_billing_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    sourceTemplateId: uuid('source_template_id').references(() => quotationTemplates.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (subscription) => [
    index('subscriptions_status_billing_idx').on(subscription.status, subscription.nextBillingAt),
    index('subscriptions_customer_id_idx').on(subscription.customerId),
    index('subscriptions_plan_id_idx').on(subscription.planId),
  ],
)

export const subscriptionLines = pgTable(
  'subscription_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    variantId: uuid('variant_id').references(() => productVariants.id),
    description: text('description').notNull().default(''),
    quantity: bigint('quantity', { mode: 'number' }).notNull(),
    unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (line) => [
    index('subscription_lines_subscription_id_idx').on(line.subscriptionId),
    check('subscription_lines_quantity_check', sql`quantity >= 1`),
  ],
)

export const subscriptionLineTaxes = pgTable('subscription_line_taxes', {
  subscriptionLineId: uuid('subscription_line_id')
    .notNull()
    .references(() => subscriptionLines.id),
  taxId: uuid('tax_id')
    .notNull()
    .references(() => taxes.id),
})

export const subscriptionEvents = pgTable('subscription_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id')
    .notNull()
    .references(() => subscriptions.id),
  eventType: text('event_type').notNull(),
  actor: text('actor').notNull(),
  payload: jsonb('payload').$type<Record<string, string> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type SubscriptionRow = typeof subscriptions.$inferSelect
export type SubscriptionLineRow = typeof subscriptionLines.$inferSelect
export type SubscriptionEventRow = typeof subscriptionEvents.$inferSelect
