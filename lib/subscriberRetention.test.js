// Waitlist retention rules. This decides an IRREVERSIBLE delete, so the rule that
// protects a real user (rule 1) is tested against every other combination, not just
// the happy path.
//
// Synthetic fixtures only — this repo is public.

import { describe, it, expect } from 'vitest'
import {
  purgeDecision,
  NEVER_CONTACTED_TTL_DAYS,
  DISMISSED_TTL_DAYS,
} from './subscriberRetention'

const NOW = new Date('2026-08-16T12:00:00Z')
const daysAgo = n => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
const row = (over = {}) => ({
  created_at: daysAgo(10), invited_at: null, dismissed_at: null, ...over,
})
const decide = (r, hasProfile = false) => purgeDecision(r, { hasProfile, now: NOW })

describe('rule 1 — an existing account is never purged', () => {
  it('keeps a row that matches a profile, however old', () => {
    expect(decide(row({ created_at: daysAgo(5000) }), true).purge).toBe(false)
    expect(decide(row({ created_at: daysAgo(5000) }), true).reason).toBe('has_profile')
  })

  // The safety property: no combination of the other fields can override rule 1.
  it('keeps a profile row under EVERY other combination of flags', () => {
    const ages = [0, 89, 90, 364, 365, 5000]
    for (const c of ages) {
      for (const inv of [null, daysAgo(c)]) {
        for (const dis of [null, daysAgo(c)]) {
          const d = decide(row({ created_at: daysAgo(c), invited_at: inv, dismissed_at: dis }), true)
          expect(d.purge, `age=${c} invited=${!!inv} dismissed=${!!dis}`).toBe(false)
        }
      }
    }
  })
})

describe('rule 2 — dismissed rows age out from the dismissal', () => {
  it('purges a dismissal older than the window', () => {
    const d = decide(row({ dismissed_at: daysAgo(DISMISSED_TTL_DAYS + 1) }))
    expect(d).toEqual({ purge: true, reason: 'dismissed_expired' })
  })

  it('purges exactly at the boundary', () => {
    expect(decide(row({ dismissed_at: daysAgo(DISMISSED_TTL_DAYS) })).purge).toBe(true)
  })

  it('keeps a recent dismissal', () => {
    const d = decide(row({ dismissed_at: daysAgo(DISMISSED_TTL_DAYS - 1) }))
    expect(d).toEqual({ purge: false, reason: 'dismissed_recent' })
  })

  // Precedence: the dismissal date wins over the signup date, which is the
  // CONSERVATIVE direction — an ancient row dismissed yesterday is kept.
  it('keeps an ancient row that was only just dismissed', () => {
    const d = decide(row({ created_at: daysAgo(5000), dismissed_at: daysAgo(1) }))
    expect(d).toEqual({ purge: false, reason: 'dismissed_recent' })
  })
})

describe('rule 3 — never contacted, never converted', () => {
  it('purges after the 12-month window', () => {
    const d = decide(row({ created_at: daysAgo(NEVER_CONTACTED_TTL_DAYS + 1) }))
    expect(d).toEqual({ purge: true, reason: 'uncontacted_expired' })
  })

  it('purges exactly at the boundary', () => {
    expect(decide(row({ created_at: daysAgo(NEVER_CONTACTED_TTL_DAYS) })).purge).toBe(true)
  })

  it('keeps a row one day short of the window', () => {
    const d = decide(row({ created_at: daysAgo(NEVER_CONTACTED_TTL_DAYS - 1) }))
    expect(d).toEqual({ purge: false, reason: 'uncontacted_recent' })
  })

  it('keeps a fresh signup', () => {
    expect(decide(row({ created_at: daysAgo(0) })).purge).toBe(false)
  })
})

describe('the documented gap — invited but never converted', () => {
  it('keeps an invited row indefinitely (known, flagged, deliberate)', () => {
    const d = decide(row({ created_at: daysAgo(5000), invited_at: daysAgo(4000) }))
    expect(d).toEqual({ purge: false, reason: 'invited_kept' })
  })
})

describe('malformed input fails safe (keeps the row)', () => {
  it('never purges on a missing or unparseable timestamp', () => {
    expect(decide(row({ created_at: null })).purge).toBe(false)
    expect(decide(row({ created_at: 'not-a-date' })).purge).toBe(false)
    expect(decide(row({ dismissed_at: 'not-a-date' })).purge).toBe(false)
    expect(decide(undefined).purge).toBe(false)
    expect(decide({}).purge).toBe(false)
  })
})

describe('published constants', () => {
  // These are stated in the privacy policy. Changing one here without changing the
  // policy publishes a commitment we don't keep — this test is the tripwire.
  it('are the coordinated values (12 months / 90 days)', () => {
    expect(NEVER_CONTACTED_TTL_DAYS).toBe(365)
    expect(DISMISSED_TTL_DAYS).toBe(90)
  })
})
