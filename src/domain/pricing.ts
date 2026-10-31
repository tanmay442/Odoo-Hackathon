export type DiscountKind = 'fixed' | 'percentage'
export type DiscountScope = 'product' | 'subscription'

export type PricingLineInput = {
  key: string
  productId: string
  quantity: number
  unitPriceMinor: number
  taxIds: string[]
}

export type PricingTaxInput = {
  id: string
  rateBasisPoints: number
}

export type PricingDiscountInput = {
  id: string
  kind: DiscountKind
  valueMinorOrBasisPoints: number
  scope: DiscountScope
  productIds: string[]
  minPurchaseMinor: number | null
  minQuantity: number | null
  startsAt: Date | null
  endsAt: Date | null
  maxRedemptions: number | null
  timesRedeemed: number
  isActive: boolean
}

export type PricedLineTax = {
  taxId: string
  rateBasisPoints: number
  taxableMinor: number
  taxMinor: number
}

export type PricedLine = {
  key: string
  productId: string
  quantity: number
  unitPriceMinor: number
  baseMinor: number
  discountMinor: number
  netMinor: number
  taxes: PricedLineTax[]
  taxMinor: number
}

export type AppliedDiscount = {
  discountId: string
  amountMinor: number
  discardedMinor: number
}

export type TaxSummaryRow = {
  rateBasisPoints: number
  taxIds: string[]
  taxableMinor: number
  taxMinor: number
}

export type PriceQuote = {
  lines: PricedLine[]
  discounts: AppliedDiscount[]
  taxSummary: TaxSummaryRow[]
  subtotalMinor: number
  discountMinor: number
  taxMinor: number
  totalMinor: number
}

function lineBase(line: PricingLineInput): number {
  return Math.round(line.unitPriceMinor) * line.quantity
}

function eligibleBase(discount: PricingDiscountInput, lines: PricingLineInput[]): number {
  if (discount.scope === 'subscription') {
    return lines.reduce((total, line) => total + lineBase(line), 0)
  }
  return lines
    .filter((line) => discount.productIds.includes(line.productId))
    .reduce((total, line) => total + lineBase(line), 0)
}

function eligibleQuantity(discount: PricingDiscountInput, lines: PricingLineInput[]): number {
  if (discount.scope === 'subscription') {
    return lines.reduce((total, line) => total + line.quantity, 0)
  }
  return lines
    .filter((line) => discount.productIds.includes(line.productId))
    .reduce((total, line) => total + line.quantity, 0)
}

export function isDiscountApplicable(
  discount: PricingDiscountInput,
  lines: PricingLineInput[],
  asOf: Date,
): boolean {
  if (!discount.isActive) return false
  if (discount.startsAt !== null && discount.startsAt > asOf) return false
  if (discount.endsAt !== null && discount.endsAt < asOf) return false
  if (discount.maxRedemptions !== null && discount.timesRedeemed >= discount.maxRedemptions) {
    return false
  }
  if (discount.scope === 'product') {
    const matches = lines.some((line) => discount.productIds.includes(line.productId))
    if (!matches) return false
  }
  if (discount.minPurchaseMinor !== null && eligibleBase(discount, lines) < discount.minPurchaseMinor) {
    return false
  }
  if (discount.minQuantity !== null && eligibleQuantity(discount, lines) < discount.minQuantity) {
    return false
  }
  return true
}

function rawDiscountAmount(
  discount: PricingDiscountInput,
  eligibleRemainingMinor: number,
): number {
  if (eligibleRemainingMinor <= 0) return 0
  if (discount.kind === 'fixed') return Math.round(discount.valueMinorOrBasisPoints)
  return Math.round((eligibleRemainingMinor * discount.valueMinorOrBasisPoints) / 10000)
}

function isDiscountEligibleLine(discount: PricingDiscountInput, productId: string): boolean {
  return discount.scope === 'subscription' || discount.productIds.includes(productId)
}

// Largest-remainder split: every line gets its floor share, leftover paise
// go to the lines with the biggest fractional parts, ties broken by key so
// the same quote always allocates the same way.
function allocateAmount(amountMinor: number, remainingByKey: Map<string, number>): Map<string, number> {
  const entries = [...remainingByKey.entries()].filter(([, remaining]) => remaining > 0)
  const allocation = new Map<string, number>()
  if (amountMinor <= 0 || entries.length === 0) return allocation
  const total = entries.reduce((sum, [, remaining]) => sum + remaining, 0)
  if (total <= 0) return allocation
  const shares = entries.map(([key, remaining]) => {
    const exact = (amountMinor * remaining) / total
    const floored = Math.floor(exact)
    return { key, floored, fraction: exact - floored }
  })
  const flooredTotal = shares.reduce((sum, share) => sum + share.floored, 0)
  shares.sort((first, second) => {
    if (second.fraction !== first.fraction) return second.fraction - first.fraction
    return first.key < second.key ? -1 : 1
  })
  let leftover = amountMinor - flooredTotal
  for (const share of shares) {
    if (leftover <= 0) break
    share.floored += 1
    leftover -= 1
  }
  for (const share of shares) {
    allocation.set(share.key, share.floored)
  }
  return allocation
}

export type PriceQuoteInput = {
  lines: PricingLineInput[]
  taxes: PricingTaxInput[]
  discounts: PricingDiscountInput[]
  asOf: Date
}

// Single implementation for the subscription preview and invoice generation:
// line totals, then discount before tax, then per-line tax at finalization
// rates rounded per line, aggregated per rate. Discount can never push the
// total below zero; the capped-off part is reported as discarded.
export function priceQuote(input: PriceQuoteInput): PriceQuote {
  const taxById = new Map(input.taxes.map((tax) => [tax.id, tax.rateBasisPoints]))
  const remainingByKey = new Map<string, number>()
  const baseByKey = new Map<string, number>()
  for (const line of input.lines) {
    const base = lineBase(line)
    baseByKey.set(line.key, base)
    remainingByKey.set(line.key, base)
  }
  const subtotalMinor = [...baseByKey.values()].reduce((sum, base) => sum + base, 0)

  const applicable = input.discounts
    .filter((discount) => isDiscountApplicable(discount, input.lines, input.asOf))
    .sort((first, second) =>
      first.id < second.id ? -1 : first.id > second.id ? 1 : 0,
    )

  const applied: AppliedDiscount[] = []
  const discountByKey = new Map<string, number>()
  for (const discount of applicable) {
    const eligibleRemaining = new Map<string, number>()
    for (const line of input.lines) {
      if (!isDiscountEligibleLine(discount, line.productId)) continue
      const remaining = remainingByKey.get(line.key) ?? 0
      if (remaining > 0) eligibleRemaining.set(line.key, remaining)
    }
    const eligibleTotal = [...eligibleRemaining.values()].reduce((sum, value) => sum + value, 0)
    const raw = rawDiscountAmount(discount, eligibleTotal)
    const amount = Math.min(raw, eligibleTotal)
    const allocation = allocateAmount(amount, eligibleRemaining)
    for (const [key, share] of allocation) {
      remainingByKey.set(key, (remainingByKey.get(key) ?? 0) - share)
      discountByKey.set(key, (discountByKey.get(key) ?? 0) + share)
    }
    if (amount > 0 || raw > 0) {
      applied.push({
        discountId: discount.id,
        amountMinor: amount,
        discardedMinor: raw - amount,
      })
    }
  }

  const pricedLines: PricedLine[] = input.lines.map((line) => {
    const base = baseByKey.get(line.key) ?? 0
    const lineDiscount = discountByKey.get(line.key) ?? 0
    const net = base - lineDiscount
    const lineTaxes: PricedLineTax[] = line.taxIds
      .map((taxId) => ({ taxId, rate: taxById.get(taxId) }))
      .filter((entry): entry is { taxId: string; rate: number } => entry.rate !== undefined)
      .map((entry) => ({
        taxId: entry.taxId,
        rateBasisPoints: entry.rate,
        taxableMinor: net,
        taxMinor: Math.round((net * entry.rate) / 10000),
      }))
    return {
      key: line.key,
      productId: line.productId,
      quantity: line.quantity,
      unitPriceMinor: Math.round(line.unitPriceMinor),
      baseMinor: base,
      discountMinor: lineDiscount,
      netMinor: net,
      taxes: lineTaxes,
      taxMinor: lineTaxes.reduce((sum, tax) => sum + tax.taxMinor, 0),
    }
  })

  const summaryByRate = new Map<number, TaxSummaryRow>()
  for (const line of pricedLines) {
    for (const tax of line.taxes) {
      const row = summaryByRate.get(tax.rateBasisPoints) ?? {
        rateBasisPoints: tax.rateBasisPoints,
        taxIds: [],
        taxableMinor: 0,
        taxMinor: 0,
      }
      if (!row.taxIds.includes(tax.taxId)) row.taxIds.push(tax.taxId)
      row.taxableMinor += tax.taxableMinor
      row.taxMinor += tax.taxMinor
      summaryByRate.set(tax.rateBasisPoints, row)
    }
  }
  const taxSummary = [...summaryByRate.values()].sort(
    (first, second) => first.rateBasisPoints - second.rateBasisPoints,
  )

  const discountMinor = applied.reduce((sum, row) => sum + row.amountMinor, 0)
  const taxMinor = pricedLines.reduce((sum, line) => sum + line.taxMinor, 0)
  return {
    lines: pricedLines,
    discounts: applied,
    taxSummary,
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor: subtotalMinor - discountMinor + taxMinor,
  }
}
