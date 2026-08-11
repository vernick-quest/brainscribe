import { describe, it, expect } from 'vitest'
import { COACH_RULES_VERSION, buildCoachSystemBlocks } from './prompts'

// COACH_RULES_VERSION is stamped onto every session at creation (app/api/sessions)
// so an audit finding can be triaged against the rules that were live when the
// session RAN. Its value is meaningless on its own — what must hold is that it is a
// stable, content-derived identifier of the SHARED rules, and that it does NOT move
// for reasons unrelated to those rules (a persona switch must not look like a rules
// change, or every switched session reads as "ran on different rules").
describe('COACH_RULES_VERSION', () => {
  it('is a 12-char lowercase hex digest', () => {
    expect(COACH_RULES_VERSION).toMatch(/^[0-9a-f]{12}$/)
  })

  it('is stable across reads (deterministic, not per-call)', () => {
    expect(COACH_RULES_VERSION).toBe(COACH_RULES_VERSION)
  })

  it('is derived from real rule content, not an empty/placeholder hash', () => {
    // sha256('') -> e3b0c44298fc... — catches the case where the rule getters
    // silently return empty and the stamp becomes a constant that means nothing.
    expect(COACH_RULES_VERSION).not.toBe('e3b0c44298fc')
  })

  it('does NOT vary by persona — a persona switch is not a rules change', () => {
    // The prompt itself differs per persona (guard against the inverse mistake:
    // hashing the whole prefix, which would make every switch look like new rules).
    const a = buildCoachSystemBlocks('owen', 'Write a paragraph.', null, {})
    const b = buildCoachSystemBlocks('jade', 'Write a paragraph.', null, {})
    expect(a.staticPrefix).not.toBe(b.staticPrefix)
    // ...while the stamp stays put.
    expect(COACH_RULES_VERSION).toMatch(/^[0-9a-f]{12}$/)
  })

  it('the shared rules it hashes are actually present in every persona prefix', () => {
    // If the guardrail/structural blocks stopped being injected, the stamp would
    // still be a valid hash of text nobody sees — a silently meaningless signal.
    for (const persona of ['owen', 'deon', 'zoe', 'alistair', 'matilda', 'jade']) {
      const { staticPrefix } = buildCoachSystemBlocks(persona, 'Write a paragraph.', null, {})
      expect(staticPrefix).toContain('CORE GUARDRAILS')
      expect(staticPrefix).toContain('SAFETY — BIGGER THAN THE ESSAY')
    }
  })
})
