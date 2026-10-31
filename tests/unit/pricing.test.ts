import { describe, expect, it } from 'vitest'

import type {
  PricingDiscountInput,
  PricingLineInput,
  PricingTaxInput,
} from '../../src/domain/pricing'
import { isDiscountApplicable, priceQuote } from '../../src/domain/pricing'

const asOf = new Date('2026-06-15T00:00:00Z')

function line(overrides: Partial<PricingLineInput> = {}): PricingLineInput {
  return {
    key: 'line-1',
    productId: 'product-1',
    quantity: 1,
    unitPriceMinor: 500000,
    taxIds: [],
    ...overrides,
  }
}

function tax(overrides: Partial<PricingTaxInput> = {}): PricingTaxInput {
  return { id: 'tax-1', rateBasisPoints: 1800, ...overrides }
}

function discount(overrides: Partial<PricingDiscountInput> = {}): PricingDiscountInput {
  return {
    id: 'discount-1',
    kind: 'percentage',
    valueMinorOrBasisPoints: 1000,
    scope: 'subscription',
    productIds: [],
    minPurchaseMinor: null,
    minQuantity: null,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    timesRedeemed: 0,
    isActive: true,
    ...overrides,
  }
}

describe('priceQuote basics', () => {
  it('totals lines with no discounts or taxes', () => {
    const quote = priceQuote({
      lines: [line({ quantity: 2, unitPriceMinor: 25000 })],
      taxes: [],
      discounts: [],
      asOf,
    })
    expect(quote.subtotalMinor).toBe(50000)
    expect(quote.discountMinor).toBe(0)
    expect(quote.taxMinor).toBe(0)
    expect(quote.totalMinor).toBe(50000)
    expect(quote.lines[0]).toMatchObject({
      baseMinor: 50000,
      discountMinor: 0,
      netMinor: 50000,
    })
  })

  it('applies a percentage discount across the whole subscription', () => {
    const quote = priceQuote({
      lines: [line({ quantity: 2, unitPriceMinor: 25000 })],
      taxes: [],
      discounts: [discount({ kind: 'percentage', valueMinorOrBasisPoints: 1000 })],
      asOf,
    })
    expect(quote.discountMinor).toBe(5000)
    expect(quote.totalMinor).toBe(45000)
    expect(quote.discounts).toEqual([{ discountId: 'discount-1', amountMinor: 5000, discardedMinor: 0 }])
  })

  it('applies a fixed discount and reports the discarded excess', () => {
    const quote = priceQuote({
      lines: [line({ unitPriceMinor: 4000 })],
      taxes: [],
      discounts: [discount({ kind: 'fixed', valueMinorOrBasisPoints: 10000 })],
      asOf,
    })
    expect(quote.discountMinor).toBe(4000)
    expect(quote.totalMinor).toBe(0)
    expect(quote.discounts).toEqual([
      { discountId: 'discount-1', amountMinor: 4000, discardedMinor: 6000 },
    ])
  })

  it('never lets the total go negative', () => {
    const quote = priceQuote({
      lines: [line({ unitPriceMinor: 4000 })],
      taxes: [tax()],
      discounts: [discount({ kind: 'fixed', valueMinorOrBasisPoints: 999999 })],
      asOf,
    })
    expect(quote.totalMinor).toBe(0)
    expect(quote.taxMinor).toBe(0)
  })

  it('rounds percentage math to whole paise', () => {
    const quote = priceQuote({
      lines: [line({ unitPriceMinor: 333 })],
      taxes: [],
      discounts: [discount({ kind: 'percentage', valueMinorOrBasisPoints: 1000 })],
      asOf,
    })
    expect(quote.discountMinor).toBe(33)
    expect(quote.totalMinor).toBe(300)
  })
})

describe('priceQuote scopes', () => {
  const twoLines = [
    line({ key: 'line-a', productId: 'product-a', unitPriceMinor: 10000 }),
    line({ key: 'line-b', productId: 'product-b', unitPriceMinor: 30000 }),
  ]

  it('limits a product discount to matching lines', () => {
    const quote = priceQuote({
      lines: twoLines,
      taxes: [],
      discounts: [
        discount({
          kind: 'percentage',
          valueMinorOrBasisPoints: 5000,
          scope: 'product',
          productIds: ['product-a'],
        }),
      ],
      asOf,
    })
    expect(quote.discountMinor).toBe(5000)
    expect(quote.lines.find((row) => row.key === 'line-a')?.discountMinor).toBe(5000)
    expect(quote.lines.find((row) => row.key === 'line-b')?.discountMinor).toBe(0)
    expect(quote.totalMinor).toBe(35000)
  })

  it('ignores a product discount with no matching line', () => {
    const quote = priceQuote({
      lines: twoLines,
      taxes: [],
      discounts: [
        discount({ scope: 'product', productIds: ['product-missing'] }),
      ],
      asOf,
    })
    expect(quote.discountMinor).toBe(0)
    expect(quote.discounts).toEqual([])
  })

  it('splits a subscription discount proportionally with whole-paise shares', () => {
    const quote = priceQuote({
      lines: [
        line({ key: 'line-a', productId: 'product-a', unitPriceMinor: 100 }),
        line({ key: 'line-b', productId: 'product-b', unitPriceMinor: 100 }),
        line({ key: 'line-c', productId: 'product-c', unitPriceMinor: 100 }),
      ],
      taxes: [],
      discounts: [discount({ kind: 'fixed', valueMinorOrBasisPoints: 100 })],
      asOf,
    })
    const shares = quote.lines.map((row) => row.discountMinor).sort((a, b) => b - a)
    expect(shares).toEqual([34, 33, 33])
    expect(quote.discountMinor).toBe(100)
  })

  it('applies stacked discounts in a stable order', () => {
    const quote = priceQuote({
      lines: [line({ unitPriceMinor: 10000 })],
      taxes: [],
      discounts: [
        discount({ id: 'discount-b', kind: 'fixed', valueMinorOrBasisPoints: 1000 }),
        discount({ id: 'discount-a', kind: 'percentage', valueMinorOrBasisPoints: 1000 }),
      ],
      asOf,
    })
    expect(quote.discounts.map((row) => row.discountId)).toEqual(['discount-a', 'discount-b'])
    expect(quote.discountMinor).toBe(1000 + 1000)
    expect(quote.totalMinor).toBe(8000)
  })
})

describe('isDiscountApplicable edges', () => {
  const lines = [line({ quantity: 5, unitPriceMinor: 100000 })]

  it.each([
    { name: 'inactive rule', patch: { isActive: false }, expected: false },
    { name: 'not yet started', patch: { startsAt: new Date('2026-07-01T00:00:00Z') }, expected: false },
    { name: 'already ended', patch: { endsAt: new Date('2026-06-01T00:00:00Z') }, expected: false },
    {
      name: 'redemption cap reached',
      patch: { maxRedemptions: 3, timesRedeemed: 3 },
      expected: false,
    },
    {
      name: 'below minimum purchase',
      patch: { minPurchaseMinor: 500001 },
      expected: false,
    },
    { name: 'below minimum quantity', patch: { minQuantity: 6 }, expected: false },
    {
      name: 'exactly at minimum purchase',
      patch: { minPurchaseMinor: 500000 },
      expected: true,
    },
    { name: 'exactly at minimum quantity', patch: { minQuantity: 5 }, expected: true },
    {
      name: 'exactly at the cap minus one',
      patch: { maxRedemptions: 4, timesRedeemed: 3 },
      expected: true,
    },
  ])('$name', ({ patch, expected }) => {
    expect(isDiscountApplicable(discount(patch), lines, asOf)).toBe(expected)
  })

  it('treats the window edges as inclusive', () => {
    expect(
      isDiscountApplicable(
        discount({
          startsAt: new Date('2026-06-15T00:00:00Z'),
          endsAt: new Date('2026-06-15T00:00:00Z'),
        }),
        lines,
        asOf,
      ),
    ).toBe(true)
  })

  it('measures minimums against matching product lines only', () => {
    const mixed = [
      line({ key: 'line-a', productId: 'product-a', quantity: 1, unitPriceMinor: 100000 }),
      line({ key: 'line-b', productId: 'product-b', quantity: 9, unitPriceMinor: 100000 }),
    ]
    expect(
      isDiscountApplicable(
        discount({ scope: 'product', productIds: ['product-a'], minQuantity: 2 }),
        mixed,
        asOf,
      ),
    ).toBe(false)
    expect(
      isDiscountApplicable(
        discount({ scope: 'product', productIds: ['product-a'], minPurchaseMinor: 100000 }),
        mixed,
        asOf,
      ),
    ).toBe(true)
  })
})

describe('priceQuote tax order', () => {
  it('computes tax after the discount, per line', () => {
    const quote = priceQuote({
      lines: [line({ quantity: 1, unitPriceMinor: 100000, taxIds: ['tax-1'] })],
      taxes: [tax()],
      discounts: [discount({ kind: 'percentage', valueMinorOrBasisPoints: 1000 })],
      asOf,
    })
    expect(quote.lines[0].taxes).toEqual([
      { taxId: 'tax-1', rateBasisPoints: 1800, taxableMinor: 90000, taxMinor: 16200 },
    ])
    expect(quote.taxMinor).toBe(16200)
    expect(quote.totalMinor).toBe(106200)
  })

  it('rounds tax per line, then aggregates per rate across lines', () => {
    const quote = priceQuote({
      lines: [
        line({ key: 'line-a', productId: 'product-a', unitPriceMinor: 333, taxIds: ['tax-low'] }),
        line({ key: 'line-b', productId: 'product-b', unitPriceMinor: 333, taxIds: ['tax-low', 'tax-high'] }),
      ],
      taxes: [tax({ id: 'tax-low', rateBasisPoints: 500 }), tax({ id: 'tax-high', rateBasisPoints: 1800 })],
      discounts: [],
      asOf,
    })
    const low = quote.taxSummary.find((row) => row.rateBasisPoints === 500)
    const high = quote.taxSummary.find((row) => row.rateBasisPoints === 1800)
    expect(low).toMatchObject({ taxableMinor: 666, taxMinor: 17 + 17 })
    expect(high).toMatchObject({ taxableMinor: 333, taxMinor: 60 })
    expect(quote.totalMinor).toBe(666 + 34 + 60)
  })

  it('ignores tax ids with no rate in force', () => {
    const quote = priceQuote({
      lines: [line({ taxIds: ['tax-missing'] })],
      taxes: [tax()],
      discounts: [],
      asOf,
    })
    expect(quote.taxMinor).toBe(0)
    expect(quote.taxSummary).toEqual([])
  })

  it('leaves the tax summary sorted by rate', () => {
    const quote = priceQuote({
      lines: [line({ taxIds: ['tax-high', 'tax-low'] })],
      taxes: [tax({ id: 'tax-high', rateBasisPoints: 2800 }), tax({ id: 'tax-low', rateBasisPoints: 500 })],
      discounts: [],
      asOf,
    })
    expect(quote.taxSummary.map((row) => row.rateBasisPoints)).toEqual([500, 2800])
  })
})
