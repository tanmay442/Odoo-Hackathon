import { formatMoney } from '../../domain/money'
import type { DiscountKind, DiscountScope } from '../../domain/pricing'

export interface DiscountSummaryInput {
  kind: DiscountKind
  valueMinorOrBasisPoints: number
  scope: DiscountScope
  minPurchaseMinor: number | null | undefined
  minQuantity: number | null | undefined
  startsAt: string | null | undefined
  endsAt: string | null | undefined
  maxRedemptions: number | null | undefined
  timesRedeemed: number
  isActive: boolean
  productCount: number
}

function formatIsoDay(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatValue(input: DiscountSummaryInput): string {
  if (input.kind === 'percentage') {
    const percent = input.valueMinorOrBasisPoints / 100
    return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`
  }
  return formatMoney(input.valueMinorOrBasisPoints, 'INR')
}

function formatScope(input: DiscountSummaryInput): string {
  if (input.scope === 'subscription') return 'subscriptions'
  return input.productCount === 1 ? '1 product' : `${input.productCount} products`
}

// Plain-language rule sentence for the discount form: the design surface is
// this sentence, not the fields, so staff can read a rule without decoding it.
export function describeDiscountRule(input: DiscountSummaryInput): string {
  const parts = [`${formatValue(input)} off ${formatScope(input)}`]
  if (input.minPurchaseMinor != null) {
    parts.push(`over ${formatMoney(input.minPurchaseMinor, 'INR')}`)
  }
  if (input.minQuantity != null) {
    parts.push(`min ${input.minQuantity} items`)
  }
  if (input.endsAt) {
    parts.push(`until ${formatIsoDay(input.endsAt)}`)
  } else if (input.startsAt) {
    parts.push(`from ${formatIsoDay(input.startsAt)}`)
  }
  if (input.maxRedemptions != null) {
    parts.push(`first ${input.maxRedemptions} uses`)
  }
  let sentence = `${parts.join(', ')}.`
  if (input.maxRedemptions != null) {
    sentence += ` ${input.timesRedeemed} used.`
  }
  if (!input.isActive) {
    sentence += ' Currently inactive.'
  }
  return sentence
}
