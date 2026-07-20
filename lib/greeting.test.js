import { describe, it, expect } from 'vitest'
import { resolveGreetingPersona, newSessionGreeting } from '@/lib/greeting'

describe('resolveGreetingPersona', () => {
  it('returns a current persona key unchanged (idempotent)', () => {
    for (const key of ['deon', 'zoe', 'alistair', 'matilda', 'owen', 'jade']) {
      expect(resolveGreetingPersona(key)).toBe(key)
    }
  })

  it('maps a retired persona key to its current key', () => {
    expect(resolveGreetingPersona('jordan')).toBe('jade')
    expect(resolveGreetingPersona('isla')).toBe('matilda')
    expect(resolveGreetingPersona('verity')).toBe('matilda')
    expect(resolveGreetingPersona('marcus')).toBe('deon')
    expect(resolveGreetingPersona('oliver')).toBe('alistair')
  })

  it('defaults unknown / undefined / empty keys to owen', () => {
    expect(resolveGreetingPersona('nobody')).toBe('owen')
    expect(resolveGreetingPersona(undefined)).toBe('owen')
    expect(resolveGreetingPersona(null)).toBe('owen')
    expect(resolveGreetingPersona('')).toBe('owen')
  })
})

describe('newSessionGreeting', () => {
  it('includes the student first name for a known persona', () => {
    const g = newSessionGreeting('owen', 'Ada')
    expect(g).toContain('Ada')
    expect(g.length).toBeGreaterThan(0)
  })

  it('falls back to "there" when the name is omitted', () => {
    const g = newSessionGreeting('owen')
    expect(g).toContain('there')
    expect(g).not.toContain('undefined')
  })

  it('resolves a retired persona key to its mapped greeting', () => {
    // 'jordan' → 'jade'; must produce the jade greeting, not the owen default.
    expect(newSessionGreeting('jordan', 'Ada')).toBe(newSessionGreeting('jade', 'Ada'))
  })

  it('returns a non-empty greeting for every current persona', () => {
    for (const key of ['deon', 'zoe', 'alistair', 'matilda', 'owen', 'jade']) {
      const g = newSessionGreeting(key, 'Ada')
      expect(typeof g).toBe('string')
      expect(g.length).toBeGreaterThan(0)
      expect(g).toContain('Ada')
    }
  })

  it('falls back to the owen greeting for an unknown persona', () => {
    expect(newSessionGreeting('nobody', 'Ada')).toBe(newSessionGreeting('owen', 'Ada'))
  })
})
