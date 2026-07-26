import { describe, it, expect } from 'vitest'
import { badgeCredit, badgeCreditLabel } from './gymCurriculum'

// The bug these guard (2026-07-25): a student had 2 skills credited from his WRITING
// PROFILE and zero completed Skill Studio sessions, and his own badge wall said
// "Practiced" for both. `state` alone can't tell the truth — `practiced_source` has to
// be read with it. The parent side got the same fix in 213f666 (lib/gymAwards.js).
describe('badgeCredit', () => {
  it('calls writing-profile credit what it is — never "practiced"', () => {
    expect(badgeCredit('practiced', 'profile')).toBe('writing')
    expect(badgeCreditLabel(badgeCredit('practiced', 'profile'))).toBe('Spotted in your writing')
  })

  it('keeps a real Skill Studio rep as practiced', () => {
    expect(badgeCredit('practiced', 'session')).toBe('studio')
    expect(badgeCreditLabel(badgeCredit('practiced', 'session'))).toBe('Practiced')
  })

  it('counts the placement warm-up as studio practice (the student did write it)', () => {
    expect(badgeCredit('practiced', 'placement')).toBe('studio')
  })

  // Fail-safe direction: never demote a real rep to profile credit.
  it('treats a missing or unknown source as studio practice', () => {
    expect(badgeCredit('practiced', undefined)).toBe('studio')
    expect(badgeCredit('practiced', null)).toBe('studio')
    expect(badgeCredit('practiced', 'something_new')).toBe('studio')
  })

  it('leaves a skill with no row untouched', () => {
    expect(badgeCredit(undefined, undefined)).toBe('none')
    expect(badgeCredit(null, 'profile')).toBe('none')
    expect(badgeCreditLabel(badgeCredit(undefined, undefined))).toBe(null)
  })

  // locked_in is the P3 rung and outranks source: it means the skill was evidenced in
  // real work, however the practiced rung was first earned. The ladder is unchanged.
  it('keeps locked-in above the source distinction', () => {
    expect(badgeCredit('locked_in', 'session')).toBe('locked_in')
    expect(badgeCredit('locked_in', 'profile')).toBe('locked_in')
    expect(badgeCreditLabel('locked_in')).toBe('Locked in')
  })

  it('never labels an unearned badge', () => {
    expect(badgeCreditLabel('none')).toBe(null)
    expect(badgeCreditLabel(undefined)).toBe(null)
  })
})
