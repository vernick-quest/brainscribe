// Parent-led consent rules. Every guard here exists because the child-first flow could be
// defeated by a minor with a second email address (Fable red-team #3, code-traced).
//
// Synthetic fixtures only — this repo is public.

import { describe, it, expect } from 'vitest'
import { evaluateParentLedConsent, UNDER13_SETUP_COPY } from './parentFirst'

const parent = (over = {}) => ({ id: 'p-1', email: 'parent@example.com', role: 'parent', ...over })
const child = (over = {}) => ({
  id: 'c-1', email: 'kid@example.com', role: 'student',
  age_bracket: 'under13', coppa_consent_given: false, ...over,
})

describe('evaluateParentLedConsent', () => {
  it('allows a real parent to establish consent for their under-13', () => {
    expect(evaluateParentLedConsent({ parent: parent(), child: child() }))
      .toEqual({ ok: true, reason: null })
  })

  // ── The attack this whole redesign exists to close ─────────────────────────────────
  it('blocks an account consenting for itself', () => {
    const same = { id: 'x-1', email: 'kid@example.com', role: 'parent' }
    const r = evaluateParentLedConsent({ parent: same, child: child({ id: 'x-1' }) })
    expect(r).toEqual({ ok: false, reason: 'self_consent' })
  })

  it('blocks a "parent" using the same mailbox as the child', () => {
    // The second-identity attack, one step removed: different account, same inbox.
    const r = evaluateParentLedConsent({
      parent: parent({ id: 'p-2', email: 'KID@example.com' }),
      child: child({ email: 'kid@example.com' }),
    })
    expect(r).toEqual({ ok: false, reason: 'same_email' })
  })

  it('matches emails case- and whitespace-insensitively', () => {
    const r = evaluateParentLedConsent({
      parent: parent({ email: '  Kid@Example.COM ' }),
      child: child({ email: 'kid@example.com' }),
    })
    expect(r.ok).toBe(false)
  })

  // ── Role rules ─────────────────────────────────────────────────────────────────────
  it('blocks a TEACHER — oversight is not parental consent', () => {
    // A school linking a student for visibility must never be read as a parent
    // consenting on that family's behalf.
    const r = evaluateParentLedConsent({ parent: parent({ role: 'teacher' }), child: child() })
    expect(r).toEqual({ ok: false, reason: 'inviter_not_parent' })
  })

  it('blocks a student-role inviter', () => {
    expect(evaluateParentLedConsent({ parent: parent({ role: 'student' }), child: child() }).reason)
      .toBe('inviter_not_parent')
  })

  it('blocks when the claiming account is itself a parent', () => {
    const r = evaluateParentLedConsent({ parent: parent(), child: child({ role: 'parent' }) })
    expect(r).toEqual({ ok: false, reason: 'child_role_conflict' })
  })

  // ── Scope rules ────────────────────────────────────────────────────────────────────
  it('does not write a consent record for a 13+ account', () => {
    // It would be meaningless and would muddy the audit trail.
    const r = evaluateParentLedConsent({ parent: parent(), child: child({ age_bracket: '13plus' }) })
    expect(r).toEqual({ ok: false, reason: 'not_under13' })
  })

  it('does not re-grant consent that already exists', () => {
    // Protects an earlier, truer consent timestamp from being overwritten by a later
    // re-claim of the same invite.
    const r = evaluateParentLedConsent({ parent: parent(), child: child({ coppa_consent_given: true }) })
    expect(r).toEqual({ ok: false, reason: 'already_granted' })
  })

  it('fails closed on missing parties', () => {
    expect(evaluateParentLedConsent({}).ok).toBe(false)
    expect(evaluateParentLedConsent({ parent: parent(), child: null }).reason).toBe('missing_party')
    expect(evaluateParentLedConsent({ parent: null, child: child() }).reason).toBe('missing_party')
  })

  it('treats a missing email as unknown rather than as a match', () => {
    // Absent emails must not collide into same_email and block a legitimate parent.
    const r = evaluateParentLedConsent({
      parent: parent({ email: null }), child: child({ email: null }),
    })
    expect(r.ok).toBe(true)
  })
})

describe('UNDER13_SETUP_COPY', () => {
  it('never uses approval language — there is deliberately nothing to approve', () => {
    const all = Object.values(UNDER13_SETUP_COPY).join(' ').toLowerCase()
    expect(all).not.toMatch(/approve|approval|consent request/)
  })

  it('reads as a next step, not a rejection', () => {
    const all = Object.values(UNDER13_SETUP_COPY).join(' ').toLowerCase()
    expect(all).not.toMatch(/sorry|cannot|can't|not allowed|denied|too young/)
  })
})
