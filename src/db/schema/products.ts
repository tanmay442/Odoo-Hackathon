import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  salesPriceMinor: bigint('sales_price_minor', { mode: 'number' }).notNull(),
  costPriceMinor: bigint('cost_price_minor', { mode: 'number' }).notNull(),
  currency: text('currency').notNull().default('INR'),
  notes: text('notes'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    name: text('name').notNull(),
    priceDeltaMinor: bigint('price_delta_minor', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (variant) => [index('product_variants_product_id_idx').on(variant.productId)],
)

export type ProductRow = typeof products.$inferSelect
export type NewProductRow = typeof products.$inferInsert
export type ProductVariantRow = typeof productVariants.$inferSelect
export type NewProductVariantRow = typeof productVariants.$inferInsert
