import { eq } from 'drizzle-orm'

import { getDatabase } from '../src/db/client'
import { customers } from '../src/db/schema/customers'
import { users } from '../src/db/schema/users'

const email = process.argv[2]?.toLowerCase()

if (!email) {
  console.error('Usage: pnpm db:link-customer <email>')
  process.exit(1)
}

const database = getDatabase()
const user = await database.query.users.findFirst({
  where: eq(users.email, email),
})
if (!user) {
  console.error(`No user with email ${email} yet. Sign up or sign in once with that email, then rerun this command.`)
  process.exit(1)
}
const customer = await database.query.customers.findFirst({
  where: eq(customers.email, email),
})
if (!customer) {
  console.error(`No seeded customer with email ${email}. Run pnpm db:seed first.`)
  process.exit(1)
}
await database
  .update(users)
  .set({ customerId: customer.id, role: 'customer', updatedAt: new Date() })
  .where(eq(users.id, user.id))
console.log(`Linked ${email} to seeded customer ${customer.displayName}.`)
process.exit(0)
