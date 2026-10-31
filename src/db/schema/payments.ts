import {
  bigint,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { customers } from './customers'
import { invoices } from './invoices'

export const paymentStatus = pgEnum('payment_status', [
  'recorded',
  'pending_verification',
  'verified',
  'rejected',
  'failed',
  'refunded',
])

export type PaymentStatus = (typeof paymentStatus.enumValues)[number]

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    method: text('method').notNull(),
    adapter: text('adapter').notNull(),
    externalReference: text('external_reference'),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('INR'),
    status: paymentStatus('status').notNull().default('recorded'),
    recordedBy: text('recorded_by').notNull(),
    verifiedBy: text('verified_by'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    paidOn: text('paid_on').notNull(),
    note: text('note').notNull().default(''),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (payment) => [
    index('payments_status_idx').on(payment.status),
    index('payments_invoice_id_idx').on(payment.invoiceId),
    index('payments_customer_id_idx').on(payment.customerId),
    index('payments_verified_at_idx').on(payment.verifiedAt),
  ],
)

// Append-only audit trail: rows are inserted on every payment change and
// never updated or deleted.
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    eventType: text('event_type').notNull(),
    actor: text('actor').notNull(),
    payload: jsonb('payload')
      .$type<Record<string, string | number | boolean | null>>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (event) => [index('payment_events_payment_id_idx').on(event.paymentId)],
)

export type PaymentRow = typeof payments.$inferSelect
export type PaymentEventRow = typeof paymentEvents.$inferSelect
