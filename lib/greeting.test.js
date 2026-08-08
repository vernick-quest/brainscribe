import { describe, it, expect } from 'vitest'
import { resolveGreetingPersona, newSessionGreeting, hasExistingWork } from '@/lib/greeting'

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

// ── The very first message must not ask about work we can already see ───────────────
// Baron uploaded a partly-filled worksheet and the opener asked "have you written anything
// so far?" — he had to reply "yes it should be in the upload". We had the answer.
describe('newSessionGreeting — existing work on the upload', () => {
  it('asks the question when the page really is blank', () => {
    expect(newSessionGreeting('owen', 'Baron')).toMatch(/have you written anything/i)
  })

  it('never asks when the upload already carried their answers', () => {
    for (const p of ['owen', 'zoe', 'deon', 'alistair', 'matilda', 'jade']) {
      const g = newSessionGreeting(p, 'Baron', { existingWork: true })
      expect(g, p).not.toMatch(/have you (written|started)|started anything|paste it below/i)
      expect(g, p).toMatch(/already/i)
    }
  })

  it('reassures that nothing was lost — the fear a half-filled upload creates', () => {
    const g = newSessionGreeting('owen', 'Baron', { existingWork: true })
    expect(g).toMatch(/nothing'?s (lost|gone)/i)
  })

  it('still uses the student\'s name in the existing-work variant', () => {
    expect(newSessionGreeting('zoe', 'Baron', { existingWork: true })).toContain('Baron')
  })

  it('hasExistingWork keys off the parse marker, and is safe on empty input', () => {
    expect(hasExistingWork('Some assignment\n\nALREADY WRITTEN BY THE STUDENT:\nTitle: x')).toBe(true)
    expect(hasExistingWork('Just a normal essay prompt.')).toBe(false)
    expect(hasExistingWork(null)).toBe(false)
    expect(hasExistingWork(undefined)).toBe(false)
  })
})
