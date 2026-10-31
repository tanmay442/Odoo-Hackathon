import { describe, expect, it } from 'vitest'

import {
  canActAsAdmin,
  canActAsStaff,
  canOwnCustomer,
  landingPathForRole,
} from '../../src/lib/auth'

describe('role gates', () => {
  it.each([
    ['admin', true],
    ['staff', false],
    ['customer', false],
  ] as const)('%s acts as admin: %s', (role, expected) => {
    expect(canActAsAdmin(role)).toBe(expected)
  })

  it.each([
    ['admin', true],
    ['staff', true],
    ['customer', false],
  ] as const)('%s acts as staff: %s', (role, expected) => {
    expect(canActAsStaff(role)).toBe(expected)
  })

  it('lets staff own any customer and owners own only theirs', () => {
    expect(canOwnCustomer('staff', null, 'customer-a')).toBe(true)
    expect(canOwnCustomer('admin', null, 'customer-a')).toBe(true)
    expect(canOwnCustomer('customer', 'customer-a', 'customer-a')).toBe(true)
    expect(canOwnCustomer('customer', 'customer-a', 'customer-b')).toBe(false)
    expect(canOwnCustomer('customer', null, 'customer-a')).toBe(false)
  })

  it('lands staff in the workspace and customers in the portal', () => {
    expect(landingPathForRole('admin')).toBe('/app')
    expect(landingPathForRole('staff')).toBe('/app')
    expect(landingPathForRole('customer')).toBe('/portal')
  })
})
