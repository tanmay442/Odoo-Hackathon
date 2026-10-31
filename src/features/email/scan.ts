import { and, eq, gte, lte } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { customers } from '../../db/schema/customers'
import { emailJobs } from '../../db/schema/email-jobs'
import { invoices } from '../../db/schema/invoices'
import { subscriptions } from '../../db/schema/subscriptions'
import { deliverEmail } from './queue'
import type { EmailPort } from '../../ports/email-port'
import { invoiceOverdueTemplate, subscriptionExpiringTemplate } from './templates'

const REMINDER_WINDOW_DAYS = 7

function weekAgo(now: Date): Date {
  return new Date(now.getTime() - REMINDER_WINDOW_DAYS * 86_400_000)
}

async function remindedRecently(
  database: Database,
  template: string,
  match: (payload: Record<string, string | number | null>) => boolean,
  since: Date,
): Promise<Set<string>> {
  const recent = await database.query.emailJobs.findMany({
    where: and(eq(emailJobs.template, template), gte(emailJobs.createdAt, since)),
    limit: 500,
  })
  const keys = new Set<string>()
  for (const job of recent) {
    const payload = job.payload
    if (!match(payload)) continue
    const id = payload['invoiceId'] ?? payload['subscriptionId']
    if (typeof id === 'string') keys.add(id)
  }
  return keys
}

export async function queueOverdueReminders(
  database: Database,
  now: Date = new Date(),
  port?: EmailPort,
): Promise<{ queued: number }> {
  const overdue = await database.query.invoices.findMany({
    where: and(eq(invoices.status, 'confirmed'), lte(invoices.dueDate, now)),
    limit: 200,
  })
  const due = overdue.filter((invoice) => invoice.amountPaidMinor < invoice.totalMinor)
  if (due.length === 0) return { queued: 0 }
  const recent = await remindedRecently(
    database,
    'invoice_overdue',
    (payload) => typeof payload['invoiceId'] === 'string',
    weekAgo(now),
  )
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  let queued = 0
  for (const invoice of due) {
    if (recent.has(invoice.id)) continue
    const customer = await database.query.customers.findFirst({
      where: eq(customers.id, invoice.customerId),
    })
    if (!customer) continue
    await deliverEmail(
      database,
      {
        template: 'invoice_overdue',
        recipient: customer.email,
        payload: { invoiceId: invoice.id, invoiceNumber: invoice.number },
        message: invoiceOverdueTemplate({
          invoiceNumber: invoice.number,
          balanceMinor: invoice.totalMinor - invoice.amountPaidMinor,
          currency: 'INR',
          dueDate: invoice.dueDate.toISOString().slice(0, 10),
          portalUrl: `${appUrl}/portal/invoices/${invoice.id}`,
        }),
      },
      port,
    )
    queued += 1
  }
  return { queued }
}

export async function queueExpiringSubscriptions(
  database: Database,
  now: Date = new Date(),
  port?: EmailPort,
): Promise<{ queued: number }> {
  const horizon = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 86_400_000)
  const expiring = await database.query.subscriptions.findMany({
    where: and(eq(subscriptions.status, 'active'), lte(subscriptions.expiryDate, horizon), gte(subscriptions.expiryDate, now)),
    limit: 200,
  })
  if (expiring.length === 0) return { queued: 0 }
  const recent = await remindedRecently(
    database,
    'subscription_expiring',
    (payload) => typeof payload['subscriptionId'] === 'string',
    weekAgo(now),
  )
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  let queued = 0
  for (const subscription of expiring) {
    if (recent.has(subscription.id)) continue
    const customer = await database.query.customers.findFirst({
      where: eq(customers.id, subscription.customerId),
    })
    if (!customer) continue
    await deliverEmail(
      database,
      {
        template: 'subscription_expiring',
        recipient: customer.email,
        payload: { subscriptionId: subscription.id, subscriptionNumber: subscription.number },
        message: subscriptionExpiringTemplate({
          subscriptionNumber: subscription.number,
          expiryDate: subscription.expiryDate.toISOString().slice(0, 10),
          portalUrl: `${appUrl}/portal/subscriptions/${subscription.id}`,
        }),
      },
      port,
    )
    queued += 1
  }
  return { queued }
}
