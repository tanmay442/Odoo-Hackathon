import { boolean, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { customers } from './customers'

export const userRole = pgEnum('user_role', ['admin', 'staff', 'customer'])

export type UserRole = (typeof userRole.enumValues)[number]

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email').notNull().unique(),
  role: userRole('role').notNull().default('customer'),
  customerId: uuid('customer_id').references(() => customers.id),
  isSeedAdmin: boolean('is_seed_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type UserRow = typeof users.$inferSelect
export type NewUserRow = typeof users.$inferInsert
