import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { customers } from '../../db/schema/customers'
import { emailJobs } from '../../db/schema/email-jobs'
import { invoices } from '../../db/schema/invoices'
import { payments } from '../../db/schema/payments'
import { subscriptions } from '../../db/schema/subscriptions'
import type { EmailPort } from '../../ports/email-port'
import { resolveEmailPort } from './queue'
import {
  invoiceOverdueTemplate,
  invoiceSentTemplate,
  paymentRejectedTemplate,
  paymentVerifiedTemplate,
  subscriptionExpiringTemplate,
} from './templates'

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000'

export interface QueuedEmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

function isoDay(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString().slice(0, 10)
}

export async function renderQueuedEmail(
  database: Database,
  job: typeof emailJobs.$inferSelect,
): Promise<QueuedEmailMessage | null> {
  const payload = job.payload
  if (job.template === 'invoice_overdue' || job.template === 'invoice_sent') {
    const invoiceId = payload['invoiceId']
    if (typeof invoiceId !== 'string') return null
    const invoice = await database.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) })
    if (!invoice) return null
    const customer = await database.query.customers.findFirst({
      where: eq(customers.id, invoice.customerId),
    })
    if (!customer) return null
    if (job.template === 'invoice_overdue') {
      const template = invoiceOverdueTemplate({
        invoiceNumber: invoice.number,
        balanceMinor: invoice.totalMinor - invoice.amountPaidMinor,
        currency: 'INR',
        dueDate: isoDay(invoice.dueDate),
        portalUrl: `${APP_URL}/portal/invoices/${invoice.id}`,
      })
      return { to: customer.email, ...template }
    }
    const template = invoiceSentTemplate({
      invoiceNumber: invoice.number,
      customerName: customer.displayName,
      totalMinor: invoice.totalMinor,
      currency: 'INR',
      dueDate: isoDay(invoice.dueDate),
      portalUrl: `${APP_URL}/portal/invoices/${invoice.id}`,
    })
    return { to: customer.email, ...template }
  }
  if (job.template === 'payment_verified' || job.template === 'payment_rejected') {
    const paymentId = payload['paymentId']
    if (typeof paymentId !== 'string') return null
    const payment = await database.query.payments.findFirst({ where: eq(payments.id, paymentId) })
    if (!payment) return null
    const invoice = await database.query.invoices.findFirst({
      where: eq(invoices.id, payment.invoiceId),
    })
    if (!invoice) return null
    const customer = await database.query.customers.findFirst({
      where: eq(customers.id, payment.customerId),
    })
    if (!customer) return null
    if (job.template === 'payment_verified') {
      const template = paymentVerifiedTemplate({
        invoiceNumber: invoice.number,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        balanceMinor: Math.max(0, invoice.totalMinor - invoice.amountPaidMinor),
      })
      return { to: customer.email, ...template }
    }
    const reason = typeof payload['reason'] === 'string' ? payload['reason'] : 'Rejected by staff'
    const template = paymentRejectedTemplate({
      invoiceNumber: invoice.number,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      reason,
    })
    return { to: customer.email, ...template }
  }
  if (job.template === 'subscription_expiring') {
    const subscriptionId = payload['subscriptionId']
    if (typeof subscriptionId !== 'string') return null
    const subscription = await database.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscriptionId),
    })
    if (!subscription) return null
    const customer = await database.query.customers.findFirst({
      where: eq(customers.id, subscription.customerId),
    })
    if (!customer) return null
    const template = subscriptionExpiringTemplate({
      subscriptionNumber: subscription.number,
      expiryDate: isoDay(subscription.expiryDate),
      portalUrl: `${APP_URL}/portal/subscriptions/${subscription.id}`,
    })
    return { to: customer.email, ...template }
  }
  return null
}

export async function dispatchPendingEmails(
  database: Database,
  port?: EmailPort,
): Promise<{ attempted: number; sent: number }> {
  const queued = await database.query.emailJobs.findMany({
    where: eq(emailJobs.status, 'queued'),
    limit: 50,
  })
  const sender = resolveEmailPort(port)
  let sent = 0
  for (const job of queued) {
    const message = await renderQueuedEmail(database, job)
    if (!message) {
      await database
        .update(emailJobs)
        .set({ status: 'failed', lastError: 'Related record is gone', attempts: job.attempts + 1 })
        .where(eq(emailJobs.id, job.id))
      continue
    }
    try {
      const result = await sender.send({
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })
      await database
        .update(emailJobs)
        .set({ status: 'sent', providerId: result.providerId, attempts: job.attempts + 1, lastError: null })
        .where(eq(emailJobs.id, job.id))
      sent += 1
    } catch (error) {
      const attempts = job.attempts + 1
      await database
        .update(emailJobs)
        .set({
          status: attempts >= 5 ? 'failed' : 'queued',
          attempts,
          lastError: error instanceof Error ? error.message : 'Email send failed',
        })
        .where(eq(emailJobs.id, job.id))
    }
  }
  return { attempted: queued.length, sent }
}
