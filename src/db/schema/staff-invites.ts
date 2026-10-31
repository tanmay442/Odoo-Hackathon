import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const staffInvites = pgTable('staff_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type StaffInviteRow = typeof staffInvites.$inferSelect
