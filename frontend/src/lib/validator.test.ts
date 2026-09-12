import { describe, expect, it } from 'vitest'
import { isEmail, isStrongPassword, passwordFailures } from './validator'

describe('password rules', () => {
  it('accepts a strong password', () => {
    expect(isStrongPassword('Cadence2026!')).toBe(true)
    expect(passwordFailures('Cadence2026!')).toEqual([])
  })

  it('rejects a password that is too short', () => {
    expect(passwordFailures('Short1!')).toContain('At least 12 characters')
  })

  it('rejects a password missing an uppercase letter', () => {
    expect(passwordFailures('longenough123!')).toContain('One uppercase letter')
  })

  it('rejects a password with no special character', () => {
    expect(passwordFailures('Longenough123')).toContain('One special character')
  })
})

describe('email validation', () => {
  it('accepts a well-formed email', () => {
    expect(isEmail('alice@example.com')).toBe(true)
  })

  it('rejects malformed emails', () => {
    expect(isEmail('alice')).toBe(false)
    expect(isEmail('alice@')).toBe(false)
    expect(isEmail('alice@example')).toBe(false)
    expect(isEmail('a b@example.com')).toBe(false)
  })
})