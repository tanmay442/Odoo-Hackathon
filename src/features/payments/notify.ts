import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { customers } from '../../db/schema/customers'
import { invoices } from '../../db/schema/invoices'
import { deliverEmail } from '../email/queue'
import { paymentRejectedTemplate, paymentVerifiedTemplate } from '../email/templates'
import type { PaymentRow } from '../../db/schema/payments'
import type { EmailPort } from '../../ports/email-port'

export async function notifyPaymentOutcome(
  database: Database,
  payment: PaymentRow,
  reason: string | null,
  port?: EmailPort,
) {
  const [invoice, customer] = await Promise.all([
    database.query.invoices.findFirst({ where: eq(invoices.id, payment.invoiceId) }),
    database.query.customers.findFirst({ where: eq(customers.id, payment.customerId) }),
  ])
  if (!invoice || !customer) return { status: 'skipped' as const }
  if (payment.status === 'verified') {
    const result = await deliverEmail(
      database,
      {
        template: 'payment_verified',
        recipient: customer.email,
        payload: { paymentId: payment.id, invoiceId: payment.invoiceId },
        message: paymentVerifiedTemplate({
          invoiceNumber: invoice.number,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          balanceMinor: Math.max(0, invoice.totalMinor - invoice.amountPaidMinor),
        }),
      },
      port,
    )
    return result
  }
  if (payment.status === 'rejected') {
    const result = await deliverEmail(
      database,
      {
        template: 'payment_rejected',
        recipient: customer.email,
        payload: { paymentId: payment.id, invoiceId: payment.invoiceId, reason },
        message: paymentRejectedTemplate({
          invoiceNumber: invoice.number,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          reason: reason ?? 'Rejected by staff',
        }),
      },
      port,
    )
    return result
  }
  return { status: 'skipped' as const }
}
