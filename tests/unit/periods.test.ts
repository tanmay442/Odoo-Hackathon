import { describe, expect, it } from 'vitest'

import { addPeriod } from '../../src/domain/periods'

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function day(result: Date): string {
  return result.toISOString().slice(0, 10)
}

describe('billing periods', () => {
  it('adds days and weeks by exact multiples', () => {
    expect(day(addPeriod(utc('2026-01-01'), 'daily', 5))).toBe('2026-01-06')
    expect(day(addPeriod(utc('2026-01-01'), 'weekly', 2))).toBe('2026-01-15')
  })

  it('clamps Jan 31 plus one month to Feb 28', () => {
    expect(day(addPeriod(utc('2026-01-31'), 'monthly', 1))).toBe('2026-02-28')
  })

  it('keeps Feb 29 in a leap year', () => {
    expect(day(addPeriod(utc('2024-01-31'), 'monthly', 1))).toBe('2024-02-29')
  })

  it('clamps March 31 plus one month to April 30', () => {
    expect(day(addPeriod(utc('2026-03-31'), 'monthly', 1))).toBe('2026-04-30')
  })

  it('clamps Feb 29 plus one year to Feb 28', () => {
    expect(day(addPeriod(utc('2024-02-29'), 'yearly', 1))).toBe('2025-02-28')
  })

  it('advances multi-month counts from mid-month dates', () => {
    expect(day(addPeriod(utc('2026-01-15'), 'monthly', 3))).toBe('2026-04-15')
  })

  it('rejects a non-positive count', () => {
    expect(() => addPeriod(utc('2026-01-01'), 'monthly', 0)).toThrow(RangeError)
  })
})
