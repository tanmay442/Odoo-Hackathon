import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { customers } from '../../db/schema/customers'
import { emailJobs } from '../../db/schema/email-jobs'
import { invoices } from '../../db/schema/invoices'
import type { UserRow } from '../../db/schema/users'
import { canActAsStaff, ForbiddenError } from '../../lib/auth'

export class ChaseError extends Error {
  readonly code = 'CHASE_REFUSED'
  readonly status = 409

  constructor(message: string) {
    super(message)
    this.name = 'ChaseError'
  }
}

export interface ChaseQueued {
  emailJobId: string
  invoiceId: string
  recipient: string
}

// Queue-only chase: the overdue reminder leaves the system through the
// email dispatcher in a later phase. This write only records the intent.
export async function queueChaseEmail(
  database: Database,
  staff: UserRow,
  invoiceId: string,
  now: Date = new Date(),
): Promise<ChaseQueued> {
  if (!canActAsStaff(staff.role)) throw new ForbiddenError()
  const invoice = await database.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
  })
  if (!invoice) throw new ForbiddenError()
  const overdue =
    invoice.status === 'confirmed' &&
    invoice.dueDate < now &&
    invoice.amountPaidMinor < invoice.totalMinor
  if (!overdue) throw new ChaseError('Only overdue invoices can be chased.')
  const customer = await database.query.customers.findFirst({
    where: eq(customers.id, invoice.customerId),
  })
  if (!customer) throw new ChaseError('Invoice customer is missing.')
  const inserted = await database
    .insert(emailJobs)
    .values({
      template: 'invoice_overdue',
      recipient: customer.email,
      payload: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        balanceMinor: invoice.totalMinor - invoice.amountPaidMinor,
        dueDate: invoice.dueDate.toISOString(),
      },
      status: 'queued',
    })
    .returning({ id: emailJobs.id })
  if (inserted.length === 0) throw new ChaseError('Chase queue insert lost its row.')
  return { emailJobId: inserted[0].id, invoiceId: invoice.id, recipient: customer.email }
}
