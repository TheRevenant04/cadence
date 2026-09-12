import { describe, expect, it } from 'vitest'
import { dueInfo, displayName } from './format'

describe('displayName', () => {
  it('capitalizes the local part of an email', () => {
    expect(displayName('alice@example.com')).toBe('Alice')
    expect(displayName('john.doe@example.com')).toBe('John.doe')
  })
})

describe('dueInfo', () => {
  it('returns null for empty values', () => {
    expect(dueInfo(null)).toBeNull()
    expect(dueInfo(undefined)).toBeNull()
    expect(dueInfo('')).toBeNull()
  })

  it('describes a date in the future', () => {
    const in3 = new Date()
    in3.setDate(in3.getDate() + 3)
    const iso = in3.toISOString().slice(0, 10)
    const info = dueInfo(iso)
    expect(info?.text).toContain('Due in 3 days')
    expect(info?.tone).toBe('slate')
  })

  it('describes an overdue date', () => {
    const past = new Date()
    past.setDate(past.getDate() - 2)
    const iso = past.toISOString().slice(0, 10)
    const info = dueInfo(iso)
    expect(info?.text).toContain('2 days overdue')
    expect(info?.tone).toBe('red')
  })
})