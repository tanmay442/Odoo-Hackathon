import { describe, expect, it } from 'vitest'

describe('worker runtime', () => {
  it('runs in workerd', () => {
    expect(typeof fetch).toBe('function')
  })
})
