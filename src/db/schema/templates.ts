import { bigint, boolean, check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { plans } from './plans'
import { products, productVariants } from './products'
import { taxes } from './taxes'

export const quotationTemplates = pgTable('quotation_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id),
  validityDays: integer('validity_days').notNull().default(30),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const quotationTemplateLines = pgTable(
  'quotation_template_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => quotationTemplates.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    variantId: uuid('variant_id').references(() => productVariants.id),
    quantity: integer('quantity').notNull().default(1),
    unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [check('quotation_template_lines_quantity_check', sql`quantity >= 1`)],
)

export const quotationTemplateLineTaxes = pgTable('quotation_template_line_taxes', {
  templateLineId: uuid('template_line_id')
    .notNull()
    .references(() => quotationTemplateLines.id),
  taxId: uuid('tax_id')
    .notNull()
    .references(() => taxes.id),
})

export type QuotationTemplateRow = typeof quotationTemplates.$inferSelect
export type QuotationTemplateLineRow = typeof quotationTemplateLines.$inferSelect
