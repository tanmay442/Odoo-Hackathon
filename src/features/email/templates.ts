import { formatMoney } from '../../domain/money'

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

function layout(title: string, bodyRows: string, actionUrl: string | null, actionLabel: string | null): string {
  const action =
    actionUrl && actionLabel
      ? `<p><a href="${actionUrl}">${actionLabel}</a></p>`
      : ''
  return `<div><h1>${title}</h1><table><tbody>${bodyRows}</tbody></table>${action}</div>`
}

function row(label: string, value: string): string {
  return `<tr><td>${label}</td><td>${value}</td></tr>`
}

export function invoiceSentTemplate(input: {
  invoiceNumber: string
  customerName: string
  totalMinor: number
  currency: string
  dueDate: string
  portalUrl: string
}): EmailTemplate {
  const total = formatMoney(input.totalMinor, input.currency)
  const subject = `Invoice ${input.invoiceNumber} from Destr — ${total} due ${input.dueDate}`
  const body = row('Invoice', input.invoiceNumber) + row('Billed to', input.customerName) + row('Total', total) + row('Due', input.dueDate)
  return {
    subject,
    html: layout(`Invoice ${input.invoiceNumber}`, body, input.portalUrl, 'View invoice'),
    text: `Invoice ${input.invoiceNumber}\nBilled to ${input.customerName}\nTotal ${total}\nDue ${input.dueDate}\n${input.portalUrl}`,
  }
}

export function paymentVerifiedTemplate(input: {
  invoiceNumber: string
  amountMinor: number
  currency: string
  balanceMinor: number
}): EmailTemplate {
  const amount = formatMoney(input.amountMinor, input.currency)
  const balance = formatMoney(input.balanceMinor, input.currency)
  const subject = `Payment verified for ${input.invoiceNumber} — ${amount}`
  return {
    subject,
    html: layout('Payment verified', row('Invoice', input.invoiceNumber) + row('Verified', amount) + row('Balance due', balance), null, null),
    text: `Payment of ${amount} verified for ${input.invoiceNumber}. Balance due ${balance}.`,
  }
}

export function paymentRejectedTemplate(input: {
  invoiceNumber: string
  amountMinor: number
  currency: string
  reason: string
}): EmailTemplate {
  const amount = formatMoney(input.amountMinor, input.currency)
  const subject = `Payment needs attention for ${input.invoiceNumber}`
  return {
    subject,
    html: layout('Payment rejected', row('Invoice', input.invoiceNumber) + row('Amount', amount) + row('Reason', input.reason), null, null),
    text: `Payment of ${amount} for ${input.invoiceNumber} was rejected: ${input.reason}`,
  }
}

export function invoiceOverdueTemplate(input: {
  invoiceNumber: string
  balanceMinor: number
  currency: string
  dueDate: string
  portalUrl: string
}): EmailTemplate {
  const balance = formatMoney(input.balanceMinor, input.currency)
  const subject = `Overdue: ${input.invoiceNumber} — ${balance} due since ${input.dueDate}`
  const body = row('Invoice', input.invoiceNumber) + row('Balance', balance) + row('Due', input.dueDate)
  return {
    subject,
    html: layout(`Overdue ${input.invoiceNumber}`, body, input.portalUrl, 'Pay now'),
    text: `Invoice ${input.invoiceNumber} is overdue. Balance ${balance}, due ${input.dueDate}. ${input.portalUrl}`,
  }
}

export function subscriptionExpiringTemplate(input: {
  subscriptionNumber: string
  expiryDate: string
  portalUrl: string
}): EmailTemplate {
  const subject = `Subscription ${input.subscriptionNumber} expires ${input.expiryDate}`
  return {
    subject,
    html: layout(`Expiring ${input.subscriptionNumber}`, row('Expires', input.expiryDate), input.portalUrl, 'Review subscription'),
    text: `Subscription ${input.subscriptionNumber} expires ${input.expiryDate}. ${input.portalUrl}`,
  }
}
