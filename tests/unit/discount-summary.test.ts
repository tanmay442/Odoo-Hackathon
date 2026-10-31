import { describe, expect, it } from 'vitest'

import { describeDiscountRule } from '../../src/features/discounts/summary'

describe('describeDiscountRule', () => {
  it('reads a percentage subscription rule in one sentence', () => {
    expect(
      describeDiscountRule({
        kind: 'percentage',
        valueMinorOrBasisPoints: 1000,
        scope: 'subscription',
        minPurchaseMinor: 500000,
        minQuantity: null,
        startsAt: null,
        endsAt: '2026-12-31',
        maxRedemptions: 100,
        timesRedeemed: 37,
        isActive: true,
        productCount: 0,
      }),
    ).toBe('10% off subscriptions, over ₹5,000.00, until 31 Dec 2026, first 100 uses. 37 used.')
  })

  it('reads a fixed product rule with quantity and start', () => {
    expect(
      describeDiscountRule({
        kind: 'fixed',
        valueMinorOrBasisPoints: 56000,
        scope: 'product',
        minPurchaseMinor: null,
        minQuantity: 2,
        startsAt: '2026-01-01',
        endsAt: null,
        maxRedemptions: null,
        timesRedeemed: 0,
        isActive: true,
        productCount: 3,
      }),
    ).toBe('₹560.00 off 3 products, min 2 items, from 1 Jan 2026.')
  })

  it('marks inactive rules', () => {
    expect(
      describeDiscountRule({
        kind: 'fixed',
        valueMinorOrBasisPoints: 100,
        scope: 'subscription',
        minPurchaseMinor: null,
        minQuantity: null,
        startsAt: null,
        endsAt: null,
        maxRedemptions: null,
        timesRedeemed: 0,
        isActive: false,
        productCount: 0,
      }),
    ).toBe('₹1.00 off subscriptions. Currently inactive.')
  })
})
