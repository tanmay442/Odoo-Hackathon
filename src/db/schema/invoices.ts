import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { customers } from './customers'
import { discounts } from './discounts'
import { products, productVariants } from './products'
import { subscriptions } from './subscriptions'
import { taxes } from './taxes'

export const invoiceStatus = pgEnum('invoice_status', ['draft', 'confirmed', 'paid', 'cancelled'])

export type InvoiceStatus = (typeof invoiceStatus.enumValues)[number]

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    status: invoiceStatus('status').notNull().default('draft'),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    subtotalMinor: bigint('subtotal_minor', { mode: 'number' }).notNull(),
    discountMinor: bigint('discount_minor', { mode: 'number' }).notNull().default(0),
    taxMinor: bigint('tax_minor', { mode: 'number' }).notNull().default(0),
    totalMinor: bigint('total_minor', { mode: 'number' }).notNull(),
    amountPaidMinor: bigint('amount_paid_minor', { mode: 'number' }).notNull().default(0),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (invoice) => [
    index('invoices_status_due_idx').on(invoice.status, invoice.dueDate),
    index('invoices_customer_id_idx').on(invoice.customerId),
    index('invoices_subscription_id_idx').on(invoice.subscriptionId),
  ],
)

export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    variantId: uuid('variant_id').references(() => productVariants.id),
    description: text('description').notNull().default(''),
    quantity: bigint('quantity', { mode: 'number' }).notNull(),
    unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (line) => [index('invoice_lines_invoice_id_idx').on(line.invoiceId)],
)

export const invoiceLineTaxes = pgTable(
  'invoice_line_taxes',
  {
    invoiceLineId: uuid('invoice_line_id')
      .notNull()
      .references(() => invoiceLines.id),
    taxId: uuid('tax_id')
      .notNull()
      .references(() => taxes.id),
    rateBasisPoints: integer('rate_basis_points').notNull(),
    taxableAmountMinor: bigint('taxable_amount_minor', { mode: 'number' }).notNull(),
    taxAmountMinor: bigint('tax_amount_minor', { mode: 'number' }).notNull(),
  },
  (link) => [
    primaryKey({ columns: [link.invoiceLineId, link.taxId] }),
    index('invoice_line_taxes_line_id_idx').on(link.invoiceLineId),
    index('invoice_line_taxes_tax_id_idx').on(link.taxId),
  ],
)

export const invoiceTaxes = pgTable(
  'invoice_taxes',
  {
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    taxId: uuid('tax_id')
      .notNull()
      .references(() => taxes.id),
    rateBasisPoints: integer('rate_basis_points').notNull(),
    taxableAmountMinor: bigint('taxable_amount_minor', { mode: 'number' }).notNull(),
    taxAmountMinor: bigint('tax_amount_minor', { mode: 'number' }).notNull(),
  },
  (row) => [
    primaryKey({ columns: [row.invoiceId, row.taxId] }),
    index('invoice_taxes_invoice_id_idx').on(row.invoiceId),
  ],
)

export const invoiceDiscounts = pgTable(
  'invoice_discounts',
  {
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    discountId: uuid('discount_id')
      .notNull()
      .references(() => discounts.id),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    discardedAmountMinor: bigint('discarded_amount_minor', { mode: 'number' }).notNull().default(0),
  },
  (row) => [
    primaryKey({ columns: [row.invoiceId, row.discountId] }),
    index('invoice_discounts_invoice_id_idx').on(row.invoiceId),
    index('invoice_discounts_discount_id_idx').on(row.discountId),
  ],
)

export type InvoiceRow = typeof invoices.$inferSelect
export type InvoiceLineRow = typeof invoiceLines.$inferSelect
export type InvoiceLineTaxRow = typeof invoiceLineTaxes.$inferSelect
export type InvoiceTaxRow = typeof invoiceTaxes.$inferSelect
export type InvoiceDiscountRow = typeof invoiceDiscounts.$inferSelect
