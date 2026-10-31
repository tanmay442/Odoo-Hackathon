import { describe, expect, it } from 'vitest'

import type { SubscriptionStatus } from '../../src/db/schema/subscriptions'
import {
  allowedSubscriptionTargets,
  assertSubscriptionTransition,
  canTransitionSubscription,
  InvalidTransitionError,
} from '../../src/domain/state-machines'

const all: SubscriptionStatus[] = ['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed']

const openFlags = { allowEarlyClose: true, allowPause: true, allowRenew: true }
const lockedFlags = { allowEarlyClose: false, allowPause: false, allowRenew: false }

const legalWithOpenFlags: Array<[SubscriptionStatus, SubscriptionStatus]> = [
  ['draft', 'quotation'],
  ['draft', 'closed'],
  ['quotation', 'confirmed'],
  ['quotation', 'closed'],
  ['confirmed', 'active'],
  ['confirmed', 'closed'],
  ['active', 'closed'],
  ['active', 'paused'],
  ['paused', 'active'],
  ['paused', 'closed'],
  ['closed', 'active'],
]

describe('subscription state machine', () => {
  it('accepts every legal move with all flags on', () => {
    for (const [from, to] of legalWithOpenFlags) {
      expect(canTransitionSubscription(from, to, openFlags)).toBe(true)
    }
  })

  it('rejects every other pair with all flags on', () => {
    const legal = new Set(legalWithOpenFlags.map(([from, to]) => `${from}->${to}`))
    for (const from of all) {
      for (const to of all) {
        if (from === to) continue
        if (legal.has(`${from}->${to}`)) continue
        expect(canTransitionSubscription(from, to, openFlags)).toBe(false)
        expect(() => assertSubscriptionTransition(from, to, openFlags)).toThrow(InvalidTransitionError)
      }
    }
  })

  it('refuses early close when the plan forbids it', () => {
    for (const from of ['draft', 'quotation', 'confirmed'] as const) {
      expect(canTransitionSubscription(from, 'closed', lockedFlags)).toBe(false)
    }
    expect(canTransitionSubscription('active', 'closed', lockedFlags)).toBe(true)
  })

  it('refuses pause and resume when the plan forbids them', () => {
    expect(canTransitionSubscription('active', 'paused', lockedFlags)).toBe(false)
    expect(canTransitionSubscription('paused', 'active', lockedFlags)).toBe(false)
  })

  it('refuses renew when the plan forbids it', () => {
    expect(canTransitionSubscription('closed', 'active', lockedFlags)).toBe(false)
    expect(canTransitionSubscription('closed', 'active', openFlags)).toBe(true)
  })

  it('never allows self transitions', () => {
    for (const status of all) {
      expect(canTransitionSubscription(status, status, openFlags)).toBe(false)
    }
  })

  it('exposes only legal targets for the UI', () => {
    expect(allowedSubscriptionTargets('draft', openFlags)).toEqual(['quotation', 'closed'])
    expect(allowedSubscriptionTargets('active', lockedFlags)).toEqual(['closed'])
  })

  it('carries a 409 status for the API layer', () => {
    const error = new InvalidTransitionError('draft', 'active')
    expect(error.status).toBe(409)
    expect(error.code).toBe('SUBSCRIPTION_INVALID_TRANSITION')
  })
})
