import { and, eq, sql } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { invoices } from '../../db/schema/invoices'
import type { PaymentRow } from '../../db/schema/payments'
import { plans } from '../../db/schema/plans'
import type { SubscriptionStatus } from '../../db/schema/subscriptions'
import { subscriptions } from '../../db/schema/subscriptions'
import { allowedSubscriptionTargets } from '../../domain/state-machines'
import { ForbiddenError } from '../../lib/auth'
import { isCustomerSubscriptionMove } from '../subscriptions/transitions'
import { getInvoiceDetail } from '../invoices/queries'
import { listInvoicePayments, listPaymentEvents } from '../payments/queries'
import { getPlan } from '../plans/queries'
import { getSubscriptionDetail } from '../subscriptions/queries'

export type PortalOverviewSubscription = {
  id: string
  number: string
  status: SubscriptionStatus
  planName: string
  nextBillingAt: string | null
}

export type PortalOverview = {
  activeSubscriptions: PortalOverviewSubscription[]
  nextBillingAt: string | null
  balanceDueMinor: number
  currency: string
}

export type CustomerLifecycleTarget = Extract<SubscriptionStatus, 'active' | 'paused' | 'closed'>

export type PortalSubscriptionDetail = {
  detail: NonNullable<Awaited<ReturnType<typeof getSubscriptionDetail>>>
  planName: string
  allowedActions: CustomerLifecycleTarget[]
}

export type PortalPaymentDisplay = PaymentRow & {
  displayStatus: 'Submitted' | 'Verified' | 'Rejected' | 'Failed' | 'Refunded' | 'Recorded'
  rejectReason: string | null
}

export type PortalInvoiceDetail = {
  detail: NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>
  payments: PortalPaymentDisplay[]
}

function displayFor(payment: PaymentRow): PortalPaymentDisplay['displayStatus'] {
  if (payment.status === 'pending_verification') return 'Submitted'
  if (payment.status === 'verified') return 'Verified'
  if (payment.status === 'rejected') return 'Rejected'
  if (payment.status === 'failed') return 'Failed'
  if (payment.status === 'refunded') return 'Refunded'
  return 'Recorded'
}

export async function getPortalOverview(
  database: Database,
  customerId: string,
): Promise<PortalOverview> {
  const rows = await database
    .select({
      id: subscriptions.id,
      number: subscriptions.number,
      status: subscriptions.status,
      nextBillingAt: subscriptions.nextBillingAt,
      planName: plans.name,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.customerId, customerId), eq(subscriptions.status, 'active')))
  const balanceRows = await database
    .select({
      balance: sql<number>`COALESCE(SUM(${invoices.totalMinor} - ${invoices.amountPaidMinor}), 0)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.customerId, customerId),
        eq(invoices.status, 'confirmed'),
        sql`${invoices.totalMinor} - ${invoices.amountPaidMinor} > 0`,
      ),
    )
  const active = rows.map((row) => ({
    id: row.id,
    number: row.number,
    status: row.status,
    planName: row.planName,
    nextBillingAt: row.nextBillingAt ? row.nextBillingAt.toISOString() : null,
  }))
  const upcoming = active
    .map((entry) => entry.nextBillingAt)
    .filter((value): value is string => value !== null)
    .sort()
  return {
    activeSubscriptions: active,
    nextBillingAt: upcoming[0] ?? null,
    balanceDueMinor: Number(balanceRows[0]?.balance ?? 0),
    currency: 'INR',
  }
}

export async function getPortalSubscription(
  database: Database,
  customerId: string,
  subscriptionId: string,
): Promise<PortalSubscriptionDetail> {
  const owned = await database.query.subscriptions.findFirst({
    where: and(eq(subscriptions.id, subscriptionId), eq(subscriptions.customerId, customerId)),
  })
  if (!owned) throw new ForbiddenError()
  const detail = await getSubscriptionDetail(database, subscriptionId)
  if (!detail) throw new ForbiddenError()
  const plan = await getPlan(database, detail.planId)
  if (!plan) throw new ForbiddenError()
  const flags = {
    allowEarlyClose: plan.allowEarlyClose,
    allowPause: plan.allowPause,
    allowRenew: plan.allowRenew,
  }
  const allowedActions = allowedSubscriptionTargets(detail.status, flags).filter(
    (to): to is CustomerLifecycleTarget => isCustomerSubscriptionMove(detail.status, to),
  )
  return { detail, planName: plan.name, allowedActions }
}

export async function getPortalInvoice(
  database: Database,
  customerId: string,
  invoiceId: string,
): Promise<PortalInvoiceDetail> {
  const owned = await database.query.invoices.findFirst({
    where: and(eq(invoices.id, invoiceId), eq(invoices.customerId, customerId)),
  })
  if (!owned) throw new ForbiddenError()
  const detail = await getInvoiceDetail(database, invoiceId)
  if (!detail) throw new ForbiddenError()
  const paymentRows = await listInvoicePayments(database, invoiceId)
  const eventRows = await Promise.all(paymentRows.map((payment) => listPaymentEvents(database, payment.id)))
  const payments: PortalPaymentDisplay[] = paymentRows.map((payment, index) => {
    const rejected = eventRows[index].find((event) => event.eventType === 'rejected')
    const payload = rejected?.payload as { reason?: unknown } | undefined
    const reason = typeof payload?.reason === 'string' ? payload.reason : null
    return { ...payment, displayStatus: displayFor(payment), rejectReason: reason }
  })
  return { detail, payments }
}
