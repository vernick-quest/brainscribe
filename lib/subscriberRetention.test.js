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
  // SUPERSEDED, kept as the record of what changed and why. This asserted that an
  // invited row was kept forever — correct when written (the author flagged the gap
  // rather than filling it unasked), and reversed by the conductor's rule 4 on
  // 2026-08-16. An address invited 4000 days ago and never used is now purged.
  it('an invited row is no longer kept forever — rule 4 now expires it', () => {
    const d = decide(row({ created_at: daysAgo(5000), invited_at: daysAgo(4000) }))
    expect(d).toEqual({ purge: true, reason: 'invited_expired' })
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

// Rule 4, added by the conductor after the author flagged the gap: an address we sent a
// code to that never became an account. Deletion is irreversible, so the boundary and
// the precedence against every other flag are pinned, same as the other rules.
describe('rule 4 — invited but never signed up', () => {
  const invitedAt = '2025-08-16T12:00:00Z'   // 365 days before NOW

  it('is kept while the year is still running', () => {
    const d = purgeDecision(
      { created_at: '2025-01-01T00:00:00Z', invited_at: '2026-08-01T00:00:00Z' },
      { now: new Date(NOW) },
    )
    expect(d).toEqual({ purge: false, reason: 'invited_kept' })
  })

  it('purges exactly at the boundary, not a day early', () => {
    expect(purgeDecision({ created_at: '2024-01-01T00:00:00Z', invited_at: invitedAt }, { now: new Date(NOW) }))
      .toEqual({ purge: true, reason: 'invited_expired' })
    const dayBefore = new Date(new Date(NOW).getTime() - 24 * 60 * 60 * 1000).toISOString()
    expect(purgeDecision({ created_at: '2024-01-01T00:00:00Z', invited_at: invitedAt }, { now: new Date(dayBefore) }).purge)
      .toBe(false)
  })

  // The clock starts at the INVITE, not signup — so an ancient row we contacted
  // recently is kept, which is the conservative direction.
  it('ages from the invite, not from signup', () => {
    expect(purgeDecision(
      { created_at: '2020-01-01T00:00:00Z', invited_at: '2026-08-01T00:00:00Z' },
      { now: new Date(NOW) },
    ).purge).toBe(false)
  })

  it('never outranks rule 1 — a user is still never purged', () => {
    expect(purgeDecision({ created_at: '2020-01-01T00:00:00Z', invited_at: invitedAt }, { hasProfile: true, now: new Date(NOW) }))
      .toEqual({ purge: false, reason: 'has_profile' })
  })

  it('a malformed invite date keeps the row', () => {
    expect(purgeDecision({ created_at: '2020-01-01T00:00:00Z', invited_at: 'not-a-date' }, { now: new Date(NOW) }).purge)
      .toBe(false)
  })
})

// Added with the blog sender (2026-08-16). An unsubscribe is a promise that lives in the
// row; deleting the row deletes the promise.
describe('rule 0 — an unsubscribed row is a suppression record', () => {
  it('is never purged, however old and whatever else is set', () => {
    expect(purgeDecision(
      { created_at: daysAgo(5000), invited_at: daysAgo(4000), dismissed_at: daysAgo(3000), unsubscribed_at: daysAgo(2000) },
      { now: NOW },
    )).toEqual({ purge: false, reason: 'unsubscribed_suppression' })
  })

  it('outranks every expiry rule that would otherwise fire', () => {
    for (const row of [
      { created_at: daysAgo(5000), unsubscribed_at: daysAgo(1) },
      { created_at: daysAgo(5000), dismissed_at: daysAgo(5000), unsubscribed_at: daysAgo(1) },
      { created_at: daysAgo(5000), invited_at: daysAgo(5000), unsubscribed_at: daysAgo(1) },
    ]) {
      expect(purgeDecision(row, { now: NOW }).purge).toBe(false)
    }
  })
})
