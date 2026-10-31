import { eq } from 'drizzle-orm'

import type { Database } from '../../db/client'
import { discounts } from '../../db/schema/discounts'
import type { PricingDiscountInput, PricingLineInput } from '../../domain/pricing'
import { isDiscountApplicable } from '../../domain/pricing'
import { listSubscriptionLineTaxes, listSubscriptionLines } from '../subscriptions/queries'

import { loadPricingDiscounts } from './mutations'
import { listSubscriptionDiscounts } from './queries'

export interface ApplicableDiscountContext {
  lines: PricingLineInput[]
  discounts: PricingDiscountInput[]
}

async function loadPreviewLines(database: Database, subscriptionId: string): Promise<PricingLineInput[]> {
  const lines = await listSubscriptionLines(database, subscriptionId)
  return Promise.all(
    lines.map(async (line) => ({
      key: line.id,
      productId: line.productId,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      taxIds: (await listSubscriptionLineTaxes(database, line.id)).map((row) => row.taxId),
    })),
  )
}

// Candidate set for one subscription at one moment. Subscription-scope rules
// need an explicit attach row; product-scope rules match automatically when a
// live line carries one of their products. The pure pricing function applies
// the same eligibility test again, so preview and invoice generation agree.
export async function findApplicableDiscounts(
  database: Database,
  subscriptionId: string,
  asOf: Date = new Date(),
): Promise<ApplicableDiscountContext> {
  const lines = await loadPreviewLines(database, subscriptionId)
  const links = await listSubscriptionDiscounts(database, subscriptionId)
  const attachedIds = links.map((link) => link.discountId)

  const productScoped = await database.query.discounts.findMany({
    where: eq(discounts.scope, 'product'),
  })
  const candidateIds = [...new Set([...attachedIds, ...productScoped.map((row) => row.id)])]
  const candidates = await loadPricingDiscounts(database, candidateIds)
  const attachedSet = new Set(attachedIds)
  const applicable = candidates.filter((discount) => {
    if (discount.scope === 'subscription' && !attachedSet.has(discount.id)) return false
    return isDiscountApplicable(discount, lines, asOf)
  })
  return { lines, discounts: applicable }
}
