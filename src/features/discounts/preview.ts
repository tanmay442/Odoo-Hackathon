import { inArray } from 'drizzle-orm'

import type { Database } from '../../db/client'
import type { PriceQuote } from '../../domain/pricing'
import { priceQuote } from '../../domain/pricing'
import { discounts } from '../../db/schema/discounts'
import { products } from '../../db/schema/products'
import { listSubscriptionLines } from '../subscriptions/queries'
import { listTaxes } from '../taxes/queries'

import { findApplicableDiscounts } from './applicability'

export type NextInvoicePreviewLine = {
  key: string
  productId: string
  productName: string
  quantity: number
  unitPriceMinor: number
  baseMinor: number
  discountMinor: number
  netMinor: number
}

export type NextInvoicePreviewDiscount = {
  discountId: string
  name: string
  amountMinor: number
  discardedMinor: number
}

export type NextInvoicePreview = {
  subscriptionId: string
  lines: NextInvoicePreviewLine[]
  discounts: NextInvoicePreviewDiscount[]
  taxSummary: PriceQuote['taxSummary']
  subtotalMinor: number
  discountMinor: number
  taxMinor: number
  totalMinor: number
}

// Runs the exact pricing function Phase 05 invoice generation calls, against
// live subscription lines. What staff see here is what the job will bill.
export async function buildNextInvoicePreview(
  database: Database,
  subscriptionId: string,
  asOf: Date = new Date(),
): Promise<NextInvoicePreview> {
  const [context, taxes] = await Promise.all([
    findApplicableDiscounts(database, subscriptionId, asOf),
    listTaxes(database),
  ])
  const quote = priceQuote({
    lines: context.lines,
    taxes: taxes.map((tax) => ({ id: tax.id, rateBasisPoints: tax.rateBasisPoints })),
    discounts: context.discounts,
    asOf,
  })
  const productNames = new Map<string, string>()
  const storedLines = await listSubscriptionLines(database, subscriptionId)
  const productIds = [...new Set(storedLines.map((line) => line.productId))]
  if (productIds.length > 0) {
    const rows = await database.query.products.findMany({
      where: inArray(products.id, productIds),
    })
    for (const row of rows) productNames.set(row.id, row.name)
  }
  const appliedNames = new Map<string, string>()
  if (quote.discounts.length > 0) {
    const rows = await database.query.discounts.findMany({
      where: inArray(
        discounts.id,
        quote.discounts.map((applied) => applied.discountId),
      ),
    })
    for (const row of rows) appliedNames.set(row.id, row.name)
  }
  return {
    subscriptionId,
    lines: quote.lines.map((line) => ({
      key: line.key,
      productId: line.productId,
      productName: productNames.get(line.productId) ?? line.productId,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      baseMinor: line.baseMinor,
      discountMinor: line.discountMinor,
      netMinor: line.netMinor,
    })),
    discounts: quote.discounts.map((applied) => ({
      discountId: applied.discountId,
      name: appliedNames.get(applied.discountId) ?? applied.discountId,
      amountMinor: applied.amountMinor,
      discardedMinor: applied.discardedMinor,
    })),
    taxSummary: quote.taxSummary,
    subtotalMinor: quote.subtotalMinor,
    discountMinor: quote.discountMinor,
    taxMinor: quote.taxMinor,
    totalMinor: quote.totalMinor,
  }
}
