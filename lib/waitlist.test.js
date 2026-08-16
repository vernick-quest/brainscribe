import { describe, it, expect } from 'vitest'
import { classifySubscriber, daysWaiting, buildWaitlistView } from './waitlist.js'

// The bug this file exists to prevent already happened once, on paper: three addresses
// sat in `subscribers`, and reading that table alone said "three people are waiting."
// Two of them had already signed up and redeemed a code. A queue that cannot tell the
// difference sends invites to people who are already inside.

const NOW = '2026-08-16T12:00:00Z'
const row = (over = {}) => ({ email: 'a@example.com', created_at: '2026-08-01T12:00:00Z', ...over })

describe('classifySubscriber', () => {
  it('is waiting when there is no account and we never wrote', () => {
    expect(classifySubscriber(row(), null)).toBe('waiting')
  })

  it('is invited once we sent a code but no account exists', () => {
    expect(classifySubscriber(row({ invited_at: NOW }), null)).toBe('invited')
  })

  it('is signed_up when an account exists but nothing is written', () => {
    expect(classifySubscriber(row(), { sessionCount: 0, turnCount: 0 })).toBe('signed_up')
  })

  it('is writing once they have actually done something', () => {
    expect(classifySubscriber(row(), { sessionCount: 2, turnCount: 8 })).toBe('writing')
  })

  // THE REGRESSION. Someone can be handed a code in person, so "we never emailed them"
  // says nothing about whether they got in. The account has to outrank our bookkeeping
  // or the queue invents work — which is exactly what the real data would have done.
  it('reads the ACCOUNT, not our records — never emailed, but signed up anyway', () => {
    expect(classifySubscriber(row({ invited_at: null }), { sessionCount: 1, turnCount: 4 })).toBe('writing')
  })

  it('a dismissed address that signs up anyway is a real user, not a ghost', () => {
    expect(classifySubscriber(row({ dismissed_at: NOW }), { sessionCount: 0, turnCount: 0 })).toBe('signed_up')
  })

  it('dismissal only applies while they never showed up', () => {
    expect(classifySubscriber(row({ dismissed_at: NOW }), null)).toBe('dismissed')
  })
})

describe('daysWaiting', () => {
  it('floors elapsed days', () => {
    expect(daysWaiting('2026-08-01T12:00:00Z', NOW)).toBe(15)
  })
  it('never returns a negative for a future timestamp', () => {
    expect(daysWaiting('2026-09-01T12:00:00Z', NOW)).toBe(0)
  })
  it('is 0 for a missing date rather than NaN', () => {
    expect(daysWaiting(null, NOW)).toBe(0)
  })
})

describe('buildWaitlistView', () => {
  // The exact live shape on 2026-08-16, which is why this is the fixture: two of the
  // three had converted, and only one was genuinely owed anything.
  const rows = [
    row({ email: 'matsui@example.com', created_at: '2026-07-29T12:00:00Z' }),
    row({ email: 'pia@example.com', created_at: '2026-08-01T12:00:00Z' }),
    row({ email: 'sierra@example.com', created_at: '2026-08-16T09:00:00Z' }),
  ]
  const accounts = {
    'pia@example.com': { role: 'parent', full_name: 'Pia', access_code_used: 'draftzero', sessionCount: 0, turnCount: 0 },
    'sierra@example.com': { role: 'student', full_name: 'Sierra', access_code_used: 'draftzero', sessionCount: 0, turnCount: 0 },
  }

  it('counts only the person who has actually heard nothing', () => {
    const { counts, needsAction } = buildWaitlistView(rows, accounts, NOW)
    expect(needsAction).toBe(1)
    expect(counts.waiting).toBe(1)
    expect(counts.signed_up).toBe(2)
  })

  it('puts the longest-waiting person needing action first', () => {
    const { items } = buildWaitlistView(rows, accounts, NOW)
    expect(items[0].email).toBe('matsui@example.com')
    expect(items[0].needsAction).toBe(true)
    expect(items[0].daysWaiting).toBe(18)
  })

  it('flags people who got in and then stalled — invisible everywhere else', () => {
    const { counts, items } = buildWaitlistView(rows, accounts, NOW)
    expect(counts.stalled).toBe(2)
    expect(items.find(i => i.email === 'pia@example.com').account.stalled).toBe(true)
  })

  it('matches emails case-insensitively — the account lookup must not miss', () => {
    const { needsAction } = buildWaitlistView(
      [row({ email: 'Pia@Example.com' })],
      { 'pia@example.com': { sessionCount: 3, turnCount: 9 } },
      NOW,
    )
    expect(needsAction).toBe(0)
  })

  it('is empty and zeroed, not undefined, with no rows', () => {
    expect(buildWaitlistView([], {}, NOW)).toEqual({ items: [], counts: { waiting: 0, invited: 0, signed_up: 0, writing: 0, dismissed: 0, stalled: 0 }, needsAction: 0 })
  })
})
