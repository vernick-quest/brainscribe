import { describe, it, expect } from 'vitest'
import {
  ageInYears,
  deriveAgeBracket,
  isCoppaProtected,
  canUseCoach,
  evaluateGateEdit,
  validateConsentBinding,
  isValidEmail,
  isValidConsentToken,
  escapeHtml,
} from '@/lib/coppa'

// A fixed reference "now" so age math is deterministic (all UTC).
const REF = new Date(Date.UTC(2026, 6, 19)) // 2026-07-19

describe('ageInYears / deriveAgeBracket — the 13 boundary', () => {
  it('counts whole years accounting for month/day', () => {
    expect(ageInYears(new Date(Date.UTC(2000, 0, 1)), REF)).toBe(26)
    expect(ageInYears(new Date(Date.UTC(2013, 6, 19)), REF)).toBe(13) // birthday is today
  })

  it('a 12-year-old is under13', () => {
    expect(deriveAgeBracket(new Date(Date.UTC(2014, 6, 19)), REF)).toBe('under13')
  })

  it('exactly 13 today is 13plus', () => {
    expect(deriveAgeBracket(new Date(Date.UTC(2013, 6, 19)), REF)).toBe('13plus')
  })

  it('turns 13 tomorrow → still under13 (month/day edge)', () => {
    // dob 2013-07-20: birthday not yet reached on 2026-07-19 → age 12
    expect(ageInYears(new Date(Date.UTC(2013, 6, 20)), REF)).toBe(12)
    expect(deriveAgeBracket(new Date(Date.UTC(2013, 6, 20)), REF)).toBe('under13')
  })

  it('turned 13 yesterday → 13plus (month/day edge)', () => {
    expect(deriveAgeBracket(new Date(Date.UTC(2013, 6, 18)), REF)).toBe('13plus')
  })
})

describe('isCoppaProtected — sticky, checks both flags', () => {
  it('true when bracket is under13', () => {
    expect(isCoppaProtected({ age_bracket: 'under13' })).toBe(true)
  })
  it('true when consent is still required even if bracket reads 13plus (legacy row)', () => {
    expect(isCoppaProtected({ age_bracket: '13plus', coppa_consent_required: true })).toBe(true)
  })
  it('false for an unprotected 13plus account', () => {
    expect(isCoppaProtected({ age_bracket: '13plus', coppa_consent_required: false })).toBe(false)
  })
  it('false for null/undefined profile', () => {
    expect(isCoppaProtected(null)).toBe(false)
    expect(isCoppaProtected(undefined)).toBe(false)
  })
})

describe('canUseCoach — the coach age gate', () => {
  it('true for admins', () => {
    expect(canUseCoach({ role: 'admin', age_bracket: 'under13' })).toBe(true)
  })
  it('true when parental consent is completed', () => {
    expect(canUseCoach({ role: 'student', age_bracket: 'under13', coppa_consent_given: true })).toBe(true)
  })
  it('true for a 13plus account with no outstanding consent requirement', () => {
    expect(canUseCoach({ role: 'student', age_bracket: '13plus' })).toBe(true)
  })
  it('false for under13 without completed consent', () => {
    expect(canUseCoach({ role: 'student', age_bracket: 'under13' })).toBe(false)
  })
  it('false for 13plus that STILL carries coppa_consent_required (flipped bracket cannot outrun consent)', () => {
    expect(canUseCoach({ role: 'student', age_bracket: '13plus', coppa_consent_required: true })).toBe(false)
  })
})

describe('evaluateGateEdit — who may move the age gate', () => {
  it('admin may do anything', () => {
    const r = evaluateGateEdit({
      actorId: 'admin1', actorRole: 'admin', targetId: 'kid1',
      target: { age_bracket: 'under13' }, newBracket: '13plus', hasWatcherLink: false,
    })
    expect(r).toEqual({ allowed: true, parentEditing: false })
  })

  it('self may move INTO protection', () => {
    const r = evaluateGateEdit({
      actorId: 'u1', actorRole: 'student', targetId: 'u1',
      target: { age_bracket: '13plus' }, newBracket: 'under13', hasWatcherLink: false,
    })
    expect(r).toEqual({ allowed: true, parentEditing: false })
  })

  it('self may NOT move OUT of protection (coppa_locked)', () => {
    const r = evaluateGateEdit({
      actorId: 'u1', actorRole: 'student', targetId: 'u1',
      target: { age_bracket: 'under13' }, newBracket: '13plus', hasWatcherLink: false,
    })
    expect(r.allowed).toBe(false)
    expect(r.code).toBe('coppa_locked')
    expect(r.status).toBe(403)
  })

  it('other with no watcher link → not_linked', () => {
    const r = evaluateGateEdit({
      actorId: 'stranger', actorRole: 'parent', targetId: 'kid1',
      target: { age_bracket: 'under13' }, newBracket: '13plus', hasWatcherLink: false,
    })
    expect(r.allowed).toBe(false)
    expect(r.code).toBe('not_linked')
  })

  it('linked teacher (not the guardian, cannot bootstrap) → coppa_not_guardian', () => {
    const r = evaluateGateEdit({
      actorId: 'teacher1', actorRole: 'teacher', targetId: 'kid1',
      target: { coppa_consent_parent_id: 'someParent' }, newBracket: '13plus', hasWatcherLink: true,
    })
    expect(r.allowed).toBe(false)
    expect(r.code).toBe('coppa_not_guardian')
  })

  it('recorded consenting guardian → allowed with parentEditing:true', () => {
    const r = evaluateGateEdit({
      actorId: 'parent1', actorRole: 'parent', targetId: 'kid1',
      target: { coppa_consent_parent_id: 'parent1' }, newBracket: '13plus', hasWatcherLink: true,
    })
    expect(r).toEqual({ allowed: true, parentEditing: true })
  })

  it('bootstrapping parent (no guardian recorded yet) → allowed with parentEditing:true', () => {
    const r = evaluateGateEdit({
      actorId: 'parent1', actorRole: 'parent', targetId: 'kid1',
      target: { coppa_consent_parent_id: null }, newBracket: 'under13', hasWatcherLink: true,
    })
    expect(r).toEqual({ allowed: true, parentEditing: true })
  })
})

describe('validateConsentBinding — verifiable parental consent binding', () => {
  const pending = { student_id: 'kid1', parent_email: 'parent@example.com' }

  it('rejects a student-role signer → student_account', () => {
    const r = validateConsentBinding({ signerId: 'p1', signerEmail: 'parent@example.com', signerRole: 'student', pending })
    expect(r).toEqual({ ok: false, code: 'student_account' })
  })

  it('rejects the student self-approving → self_consent', () => {
    const r = validateConsentBinding({ signerId: 'kid1', signerEmail: 'parent@example.com', signerRole: 'parent', pending })
    expect(r).toEqual({ ok: false, code: 'self_consent' })
  })

  it('rejects a signer whose email does not match the invited parent → email_mismatch', () => {
    const r = validateConsentBinding({ signerId: 'p1', signerEmail: 'other@example.com', signerRole: 'parent', pending })
    expect(r).toEqual({ ok: false, code: 'email_mismatch' })
  })

  it('rejects a missing signer email → email_mismatch', () => {
    const r = validateConsentBinding({ signerId: 'p1', signerEmail: null, signerRole: 'parent', pending })
    expect(r).toEqual({ ok: false, code: 'email_mismatch' })
  })

  it('accepts an exact match (case-insensitive, trimmed)', () => {
    const r = validateConsentBinding({ signerId: 'p1', signerEmail: '  Parent@Example.COM ', signerRole: 'parent', pending })
    expect(r).toEqual({ ok: true })
  })
})

describe('isValidEmail', () => {
  it('accepts a sane address', () => {
    expect(isValidEmail('ada@example.com')).toBe(true)
    expect(isValidEmail('a.b+tag@sub.example.co')).toBe(true)
  })
  it('rejects junk that includes("@") would wave through', () => {
    expect(isValidEmail('notanemail')).toBe(false)
    expect(isValidEmail('foo@bar')).toBe(false)       // no dotted domain
    expect(isValidEmail('@example.com')).toBe(false)  // empty local part
    expect(isValidEmail('a b@example.com')).toBe(false) // space
    expect(isValidEmail('a@@example.com')).toBe(false)
  })
  it('rejects non-strings and over-long addresses', () => {
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail(12345)).toBe(false)
    expect(isValidEmail('a'.repeat(250) + '@example.com')).toBe(false) // > 254
  })
})

describe('isValidConsentToken', () => {
  it('accepts 32–64 hex chars (case-insensitive)', () => {
    expect(isValidConsentToken('a'.repeat(48))).toBe(true)
    expect(isValidConsentToken('deadbeef'.repeat(4))).toBe(true) // 32
    expect(isValidConsentToken('DEADBEEF' + 'a'.repeat(24))).toBe(true)
  })
  it('rejects wrong length, non-hex, and non-strings', () => {
    expect(isValidConsentToken('abc')).toBe(false)               // too short
    expect(isValidConsentToken('a'.repeat(31))).toBe(false)      // just under 32
    expect(isValidConsentToken('a'.repeat(65))).toBe(false)      // over 64
    expect(isValidConsentToken('g'.repeat(48))).toBe(false)      // non-hex
    expect(isValidConsentToken(null)).toBe(false)
  })
})

describe('escapeHtml — name-injection defense for consent emails', () => {
  it('escapes all five HTML entities', () => {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('>')).toBe('&gt;')
    expect(escapeHtml('"')).toBe('&quot;')
    expect(escapeHtml("'")).toBe('&#39;')
  })

  it('neutralizes a markup-injection payload in a display name', () => {
    const out = escapeHtml(`<img src=x onerror="alert('x')">`)
    expect(out).not.toContain('<img')
    expect(out).not.toContain('">')
    expect(out).toContain('&lt;img')
    expect(out).toContain('&quot;')
    expect(out).toContain('&#39;')
  })

  it('coerces null/undefined to an empty string', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})
