import { describe, expect, it } from 'vitest'

import { addMoney, formatMoney, multiplyMoney } from '../../src/domain/money'

describe('money', () => {
  it('multiplies minor units by quantity', () => {
    expect(multiplyMoney(56000, 3)).toBe(168000)
  })

  it('adds minor units', () => {
    expect(addMoney(100, 250)).toBe(350)
  })

  it('formats INR minor units', () => {
    expect(formatMoney(56000, 'INR')).toContain('560')
  })
})
