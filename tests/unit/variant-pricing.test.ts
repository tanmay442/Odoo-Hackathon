import { describe, expect, it } from 'vitest'

import { effectiveVariantPrice } from '../../src/domain/money'

describe('variant effective price', () => {
  it('adds the Odoo +₹560 delta to the sales price', () => {
    expect(effectiveVariantPrice(100000, 56000)).toBe(156000)
  })

  it('supports zero and negative deltas', () => {
    expect(effectiveVariantPrice(100000, 0)).toBe(100000)
    expect(effectiveVariantPrice(100000, -20000)).toBe(80000)
  })
})
