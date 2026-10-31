import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const taxes = pgTable('taxes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  rateBasisPoints: integer('rate_basis_points').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type TaxRow = typeof taxes.$inferSelect
export type NewTaxRow = typeof taxes.$inferInsert
