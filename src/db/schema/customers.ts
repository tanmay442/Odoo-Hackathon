import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type CustomerRow = typeof customers.$inferSelect
export type NewCustomerRow = typeof customers.$inferInsert
