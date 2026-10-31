import { eq } from 'drizzle-orm'

import { getDatabase } from '../src/db/client'
import { users } from '../src/db/schema/users'

const email = process.argv[2]?.toLowerCase()

if (!email) {
  console.error('Usage: pnpm db:seed-admin <email>')
  process.exit(1)
}

const database = getDatabase()
const existing = await database.query.users.findFirst({
  where: eq(users.email, email),
})

if (existing) {
  await database
    .update(users)
    .set({ role: 'admin', isSeedAdmin: true, updatedAt: new Date() })
    .where(eq(users.id, existing.id))
  console.log(`Promoted ${email} to seed admin.`)
} else {
  console.error(`No user with email ${email} yet. Sign up or sign in once with that email, then rerun this command.`)
  process.exit(1)
}
process.exit(0)
