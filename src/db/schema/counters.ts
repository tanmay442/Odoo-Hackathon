import { integer, pgTable, text } from 'drizzle-orm/pg-core'

export const counters = pgTable('counters', {
  name: text('name').primaryKey(),
  value: integer('value').notNull().default(0),
})

export type CounterRow = typeof counters.$inferSelect
