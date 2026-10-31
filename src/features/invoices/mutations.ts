import { eq, sql } from 'drizzle-orm'

import type { Database, DbOrTx } from '../../db/client'
import { counters } from '../../db/schema/counters'
import { invoiceDiscounts, invoiceLineTaxes, invoiceLines, invoiceTaxes, invoices } from '../../db/schema/invoices'
import { outboxEvents } from '../../db/schema/outbox'
import { plans } from '../../db/schema/plans'
import { subscriptionLines, subscriptions } from '../../db/schema/subscriptions'
import type { UserRow } from '../../db/schema/users'
import { priceQuote } from '../../domain/pricing'
import type { PricingDiscountInput } from '../../domain/pricing'
import { addPeriod } from '../../domain/periods'
import { canActAsStaff, ForbiddenError } from '../../lib/auth'
import { findApplicableDiscounts } from '../discounts/applicability'
import { claimDiscountRedemption } from '../discounts/mutations'

import { getInvoice } from './queries'

export function formatInvoiceNumber(value: number): string {
  return `INV-${String(value).padStart(6, '0')}`
}

export async function nextInvoiceNumber(database: DbOrTx): Promise<string> {
  await database
    .insert(counters)
    .values({ name: 'invoice', value: 0 })
    .onConflictDoNothing({ target: counters.name })
  const updated = (await database.execute(
    sql`UPDATE counters SET value = value + 1 WHERE name = 'invoice' RETURNING value`,
  )) as unknown as Array<{ value: number }> | { rows: Array<{ value: number }> }
  const value = Array.isArray(updated) ? updated[0]?.value : updated.rows[0]?.value
  if (typeof value !== 'number') throw new Error('Counter update lost its row')
  return formatInvoiceNumber(value)
}

export type PeriodInvoiceOutcome =
  | { outcome: 'invoiced'; invoiceId: string; closed: boolean }
  | { outcome: 'skippedAlreadyBilled' }
  | { outcome: 'skippedNotDue' }

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  if (code === '23505') return true
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && message.includes('invoices_idempotency_key_unique')
}

// One billing period for one subscription, atomically. The caller loops this
// for catch-up; the unique idempotency key makes concurrent runs collapse to
// one invoice per period. Discount claims happen before pricing so the totals
// only include redemptions this transaction owns.
export async function generatePeriodInvoice(
  database: Database,
  subscriptionId: string,
  now: Date = new Date(),
): Promise<PeriodInvoiceOutcome> {
  try {
    return await database.transaction(async (tx) => {
      const subscription = await tx.query.subscriptions.findFirst({
        where: eq(subscriptions.id, subscriptionId),
      })
      if (!subscription || subscription.status !== 'active') return { outcome: 'skippedNotDue' } as const
      if (!subscription.nextBillingAt || subscription.nextBillingAt > now) {
        return { outcome: 'skippedNotDue' } as const
      }
      const periodStart = subscription.currentPeriodStart ?? subscription.startDate
      const periodEnd = subscription.currentPeriodEnd ?? subscription.nextBillingAt
      const idempotencyKey = `invoice:${subscription.id}:${periodStart.toISOString()}`
      const existing = await tx.query.invoices.findFirst({
        where: eq(invoices.idempotencyKey, idempotencyKey),
      })
      if (existing) return { outcome: 'skippedAlreadyBilled' } as const

      const plan = await tx.query.plans.findFirst({ where: eq(plans.id, subscription.planId) })
      if (!plan) throw new Error('Plan missing for subscription')

      const storedLines = await tx.query.subscriptionLines.findMany({
        where: eq(subscriptionLines.subscriptionId, subscription.id),
      })
      const context = await findApplicableDiscounts(tx, subscription.id, now)
      const taxes = await tx.query.taxes.findMany()
      const claimed: PricingDiscountInput[] = []
      for (const discount of context.discounts) {
        const row = await claimDiscountRedemption(tx, discount.id, now)
        if (row) claimed.push(discount)
      }
      const quote = priceQuote({
        lines: context.lines,
        taxes: taxes.map((tax) => ({ id: tax.id, rateBasisPoints: tax.rateBasisPoints })),
        discounts: claimed,
        asOf: now,
      })

      const number = await nextInvoiceNumber(tx)
      const inserted = await tx
        .insert(invoices)
        .values({
          number,
          subscriptionId: subscription.id,
          customerId: subscription.customerId,
          status: 'draft',
          periodStart,
          periodEnd,
          subtotalMinor: quote.subtotalMinor,
          discountMinor: quote.discountMinor,
          taxMinor: quote.taxMinor,
          totalMinor: quote.totalMinor,
          amountPaidMinor: 0,
          dueDate: periodEnd,
          idempotencyKey,
        })
        .returning()
      if (inserted.length === 0) throw new Error('Invoice insert lost its row')
      const invoice = inserted[0]

      const storedById = new Map(storedLines.map((line) => [line.id, line]))
      const lineIdByKey = new Map<string, string>()
      for (const priced of quote.lines) {
        const stored = storedById.get(priced.key)
        if (!stored) continue
        const created = await tx
          .insert(invoiceLines)
          .values({
            invoiceId: invoice.id,
            productId: stored.productId,
            variantId: stored.variantId,
            description: stored.description,
            quantity: stored.quantity,
            unitPriceMinor: stored.unitPriceMinor,
            amountMinor: priced.baseMinor,
          })
          .returning()
        if (created.length === 0) throw new Error('Invoice line insert lost its row')
        lineIdByKey.set(priced.key, created[0].id)
        for (const tax of priced.taxes) {
          await tx.insert(invoiceLineTaxes).values({
            invoiceLineId: created[0].id,
            taxId: tax.taxId,
            rateBasisPoints: tax.rateBasisPoints,
            taxableAmountMinor: tax.taxableMinor,
            taxAmountMinor: tax.taxMinor,
          })
        }
      }

      const taxTotals = new Map<string, { rateBasisPoints: number; taxableMinor: number; taxMinor: number }>()
      for (const priced of quote.lines) {
        for (const tax of priced.taxes) {
          const current = taxTotals.get(tax.taxId) ?? {
            rateBasisPoints: tax.rateBasisPoints,
            taxableMinor: 0,
            taxMinor: 0,
          }
          current.taxableMinor += tax.taxableMinor
          current.taxMinor += tax.taxMinor
          taxTotals.set(tax.taxId, current)
        }
      }
      for (const [taxId, totals] of taxTotals) {
        await tx.insert(invoiceTaxes).values({
          invoiceId: invoice.id,
          taxId,
          rateBasisPoints: totals.rateBasisPoints,
          taxableAmountMinor: totals.taxableMinor,
          taxAmountMinor: totals.taxMinor,
        })
      }

      for (const applied of quote.discounts) {
        await tx.insert(invoiceDiscounts).values({
          invoiceId: invoice.id,
          discountId: applied.discountId,
          amountMinor: applied.amountMinor,
          discardedAmountMinor: applied.discardedMinor,
        })
      }

      const nextStart = periodEnd
      const nextEnd = addPeriod(nextStart, plan.billingInterval, plan.intervalCount)
      const shouldClose = plan.autoCloseAtEnd && nextStart >= subscription.expiryDate
      if (shouldClose) {
        await tx
          .update(subscriptions)
          .set({
            status: 'closed',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            nextBillingAt: null,
            updatedAt: now,
          })
          .where(eq(subscriptions.id, subscription.id))
        await tx.insert(outboxEvents).values({
          type: 'invoice.generated',
          payload: { invoiceId: invoice.id, subscriptionId: subscription.id },
        })
        await tx.insert(outboxEvents).values({
          type: 'subscription.closed',
          payload: { subscriptionId: subscription.id, invoiceId: invoice.id },
        })
        return { outcome: 'invoiced', invoiceId: invoice.id, closed: true } as const
      }
      await tx
        .update(subscriptions)
        .set({
          currentPeriodStart: nextStart,
          currentPeriodEnd: nextEnd,
          nextBillingAt: nextEnd,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, subscription.id))
      await tx.insert(outboxEvents).values({
        type: 'invoice.generated',
        payload: { invoiceId: invoice.id, subscriptionId: subscription.id },
      })
      return { outcome: 'invoiced', invoiceId: invoice.id, closed: false } as const
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: 'skippedAlreadyBilled' }
    throw error
  }
}

export async function confirmInvoice(database: Database, actor: UserRow, invoiceId: string) {
  if (!canActAsStaff(actor.role)) throw new ForbiddenError()
  const existing = await getInvoice(database, invoiceId)
  if (!existing) throw new ForbiddenError()
  if (existing.status !== 'draft') throw new ForbiddenError()
  const updated = await database
    .update(invoices)
    .set({ status: 'confirmed', issuedAt: new Date(), updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId))
    .returning()
  if (updated.length === 0) throw new ForbiddenError()
  return updated[0]
}

export async function cancelInvoice(
  database: Database,
  actor: UserRow,
  invoiceId: string,
  reason: string,
) {
  if (!canActAsStaff(actor.role)) throw new ForbiddenError()
  const existing = await getInvoice(database, invoiceId)
  if (!existing) throw new ForbiddenError()
  if (existing.status !== 'draft' && existing.status !== 'confirmed') throw new ForbiddenError()
  const trimmed = reason.trim()
  if (!trimmed) throw new ForbiddenError()
  const updated = await database
    .update(invoices)
    .set({ status: 'cancelled', cancelReason: trimmed, updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId))
    .returning()
  if (updated.length === 0) throw new ForbiddenError()
  return updated[0]
}
