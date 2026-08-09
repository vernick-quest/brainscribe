// The order of questions in /welcome. The bug this guards against: the Beta Circle
// code used to be asked FIRST, so anyone without a code never reached the age
// question — leaving age_bracket null and the parent-first under-13 flow unrun.
//
// Synthetic fixtures only — this repo is public.

import { describe, it, expect } from 'vitest'
import { nextWelcomeStep, WELCOME_ORDER } from './welcomeFlow'

describe('nextWelcomeStep — 13+ path', () => {
  it('goes straight to the role picker when nothing else is pending', () => {
    expect(nextWelcomeStep('age', { ageBracket: '13plus' })).toBe('role')
  })

  it('asks the code AFTER age, not before', () => {
    expect(nextWelcomeStep('age', { ageBracket: '13plus', accessGated: true })).toBe('access-code')
  })

  it('asks the name nudge before the code step', () => {
    expect(nextWelcomeStep('age', { ageBracket: '13plus', nameNudge: true, accessGated: true })).toBe('name')
    expect(nextWelcomeStep('name', { ageBracket: '13plus', accessGated: true })).toBe('access-code')
  })

  it('skips the name step when the Google name looks fine', () => {
    expect(nextWelcomeStep('age', { ageBracket: '13plus', nameNudge: false, accessGated: true })).toBe('access-code')
  })

  it('continues to the role picker after a successful redeem — never back to age', () => {
    // The caller clears accessGated in the same tick, so the flag can read stale here.
    expect(nextWelcomeStep('access-code', { ageBracket: '13plus', accessGated: true })).toBe('role')
    expect(nextWelcomeStep('access-code', { ageBracket: '13plus', nameNudge: true })).toBe('role')
  })

  it('skips the code step entirely for an invited / already-granted user', () => {
    expect(nextWelcomeStep('age', { ageBracket: '13plus', accessGated: false })).toBe('role')
    expect(nextWelcomeStep('name', { ageBracket: '13plus', accessGated: false })).toBe('role')
  })
})

describe('nextWelcomeStep — under-13 path', () => {
  it('routes an under-13 into the parent-first flow', () => {
    expect(nextWelcomeStep('age', { ageBracket: 'under13' })).toBe('parent-email')
  })

  it('still nudges a flagged name first — that name is what the parent email says', () => {
    expect(nextWelcomeStep('age', { ageBracket: 'under13', nameNudge: true })).toBe('name')
    expect(nextWelcomeStep('name', { ageBracket: 'under13' })).toBe('parent-email')
  })

  // ── THE invariant: a child is never asked for a code they cannot hold ────────
  it('NEVER routes an under-13 to the access code, under any combination of flags', () => {
    const bools = [false, true]
    const froms = ['age', 'name', 'access-code', 'role', 'parent-email', 'unknown-step']
    for (const from of froms) {
      for (const nameNudge of bools) {
        for (const accessGated of bools) {
          const step = nextWelcomeStep(from, { ageBracket: 'under13', nameNudge, accessGated })
          expect(step, `from=${from} nudge=${nameNudge} gated=${accessGated}`).not.toBe('access-code')
          // ...and never the role picker either: under-13 is always a student.
          expect(step, `from=${from} nudge=${nameNudge} gated=${accessGated}`).not.toBe('role')
          expect(['name', 'parent-email']).toContain(step)
        }
      }
    }
  })

  it('sends a gated under-13 to the parent flow, not the code wall', () => {
    expect(nextWelcomeStep('age', { ageBracket: 'under13', accessGated: true })).toBe('parent-email')
  })
})

describe('nextWelcomeStep — fail-open defaults', () => {
  // The profile select fails open (pre-migration column → null row → flags stay
  // false). That must leave the gate OFF, never lock someone out.
  it('treats an unknown profile as ungated', () => {
    expect(nextWelcomeStep('age', { ageBracket: '13plus' })).toBe('role')
    expect(nextWelcomeStep('age', {})).toBe('role')
    expect(nextWelcomeStep('age')).toBe('role')
  })

  it('documents the happy-path order with the code last', () => {
    expect(WELCOME_ORDER).toEqual(['age', 'name', 'access-code', 'role'])
    expect(WELCOME_ORDER.indexOf('age')).toBeLessThan(WELCOME_ORDER.indexOf('access-code'))
    expect(WELCOME_ORDER.indexOf('name')).toBeLessThan(WELCOME_ORDER.indexOf('access-code'))
  })
})
