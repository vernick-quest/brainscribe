import { describe, it, expect } from 'vitest'
import {
  evaluateSessionHealth, allItemsConfirmed, countConfirmedItems, worstSeverity,
  SCAFFOLD_ERA_START, CHARS_PER_SECTION_LIMIT, TURNS_BEFORE_SCAFFOLD_LIMIT,
} from './sessionHealth'

const item = (status, id = 'hook') => ({ id, label: id, status, text: 'x' })
const scaffold = (items, extra = {}) => [{ index: 0, type: 'narrative', status: 'working', items, ...extra }]
const POST_ERA = '2026-08-01T00:00:00Z'
const PRE_ERA = '2026-07-01T00:00:00Z'
const session = (over = {}) => ({ id: 's1', status: 'active', is_onboarding: false, created_at: POST_ERA, truncated_turns: 0, truncated_turns_no_lock: 0, ...over })
const types = fs => fs.map(f => f.type)

describe('allItemsConfirmed — the in-progress vs lost discriminator', () => {
  it('true only when EVERY item is confirmed', () => {
    expect(allItemsConfirmed(scaffold([item('confirmed'), item('confirmed', 'ctx')]))).toBe(true)
  })
  it('false while any item is still working or locked', () => {
    // Baron's real shape: 3 confirmed + 1 working — healthy mid-flight.
    expect(allItemsConfirmed(scaffold([item('confirmed'), item('confirmed', 'a'), item('confirmed', 'b'), item('working', 'c')]))).toBe(false)
    expect(allItemsConfirmed(scaffold([item('confirmed'), item('locked', 'a')]))).toBe(false)
  })
  it('false for an empty or missing scaffold (nothing to have finished)', () => {
    expect(allItemsConfirmed(scaffold([]))).toBe(false)
    expect(allItemsConfirmed(null)).toBe(false)
  })
})

describe('no_draft_despite_locks — Sierra', () => {
  it("fires on Sierra's shape: all items confirmed, zero paragraphs", () => {
    const f = evaluateSessionHealth({
      session: session(), components: scaffold([item('confirmed'), item('confirmed', 'a'), item('confirmed', 'b'), item('confirmed', 'c')]),
      paragraphCount: 0,
    })
    expect(types(f)).toContain('no_draft_despite_locks')
    expect(f.find(x => x.type === 'no_draft_despite_locks').severity).toBe('critical')
  })

  it("does NOT fire on Baron's shape: 3 confirmed + 1 working, zero paragraphs", () => {
    // The false positive that measurement caught — 12 of 15 live active sessions have
    // no paragraphs, because paragraphs are written at assembly.
    const f = evaluateSessionHealth({
      session: session(), components: scaffold([item('confirmed'), item('confirmed', 'a'), item('confirmed', 'b'), item('working', 'c')]),
      paragraphCount: 0,
    })
    expect(types(f)).not.toContain('no_draft_despite_locks')
  })

  it('does not fire once a draft exists', () => {
    const f = evaluateSessionHealth({
      session: session(), components: scaffold([item('confirmed')]), paragraphCount: 1,
    })
    expect(types(f)).not.toContain('no_draft_despite_locks')
  })
})

describe('truncation', () => {
  it('flags a truncated turn as high severity', () => {
    const f = evaluateSessionHealth({ session: session({ truncated_turns: 2, truncated_turns_no_lock: 0 }) })
    const t = f.find(x => x.type === 'truncated_turn')
    expect(t.severity).toBe('high')
    expect(t.noLockKnown).toBe(true)
  })

  it('calls a dropped lock out explicitly', () => {
    const f = evaluateSessionHealth({ session: session({ truncated_turns: 3, truncated_turns_no_lock: 2 }) })
    expect(f.find(x => x.type === 'truncated_turn').detail).toMatch(/NO lock token/)
  })

  it('treats a NULL no_lock as UNKNOWN, never as zero', () => {
    // Pre-fix rows recorded a meaningless value. Reporting "no locks dropped" from a
    // field that never counted them is the reassuring-direction error.
    const f = evaluateSessionHealth({ session: session({ truncated_turns: 1, truncated_turns_no_lock: null }) })
    const t = f.find(x => x.type === 'truncated_turn')
    expect(t.detail).toMatch(/UNKNOWN/)
    expect(t.noLockKnown).toBe(false)
    expect(t.noLockCount).toBeNull()
  })

  it('no truncation, no finding', () => {
    expect(types(evaluateSessionHealth({ session: session({ truncated_turns: 0 }) }))).not.toContain('truncated_turn')
  })
})

describe('complete_without_draft', () => {
  it('fires when a completed session has no paragraphs and no locks', () => {
    const f = evaluateSessionHealth({ session: session({ status: 'complete' }), components: null, paragraphCount: 0 })
    expect(types(f)).toContain('complete_without_draft')
  })
  it('does not fire while the session is still active', () => {
    const f = evaluateSessionHealth({ session: session({ status: 'active' }), components: null, paragraphCount: 0 })
    expect(types(f)).not.toContain('complete_without_draft')
  })
})

describe('overstuffed_section', () => {
  it('fires past the per-section character limit', () => {
    const f = evaluateSessionHealth({
      session: session(), components: scaffold([item('working')]),
      paragraphCount: 1, studentChars: CHARS_PER_SECTION_LIMIT * 1 + 500,
    })
    expect(types(f)).toContain('overstuffed_section')
  })
  it('stays quiet at normal volume', () => {
    const f = evaluateSessionHealth({
      session: session(), components: scaffold([item('working')]), paragraphCount: 1, studentChars: 400,
    })
    expect(types(f)).not.toContain('overstuffed_section')
  })
})

describe('late_scaffold', () => {
  it('fires when many turns passed with no scaffold at all', () => {
    const f = evaluateSessionHealth({ session: session(), components: null, studentTurns: TURNS_BEFORE_SCAFFOLD_LIMIT + 1 })
    expect(types(f)).toContain('late_scaffold')
  })
  it('fires when the scaffold arrived late', () => {
    const f = evaluateSessionHealth({
      session: session(), components: scaffold([item('working')]), paragraphCount: 1,
      turnsBeforeScaffold: TURNS_BEFORE_SCAFFOLD_LIMIT + 3,
    })
    expect(types(f)).toContain('late_scaffold')
  })
  it('stays quiet for a short look-around with no scaffold', () => {
    const f = evaluateSessionHealth({ session: session(), components: null, studentTurns: 3 })
    expect(types(f)).not.toContain('late_scaffold')
  })
})

describe('scoping and noise control', () => {
  it('never flags the onboarding warm-up — it has no scaffold or draft by design', () => {
    const f = evaluateSessionHealth({
      session: session({ is_onboarding: true, status: 'complete', truncated_turns: 5 }),
      components: null, paragraphCount: 0, studentTurns: 40,
    })
    expect(f).toEqual([])
  })

  it('marks pre-era sessions as pre-existing so 12 historical rows cannot train the eye to ignore the tab', () => {
    const f = evaluateSessionHealth({ session: session({ created_at: PRE_ERA, status: 'complete' }), components: null, paragraphCount: 0 })
    expect(f.every(x => x.preExisting)).toBe(true)
  })

  it('does not mark post-era sessions as pre-existing', () => {
    const f = evaluateSessionHealth({ session: session({ status: 'complete' }), components: null, paragraphCount: 0 })
    expect(f.every(x => x.preExisting === false)).toBe(true)
  })

  it('a healthy session produces nothing at all', () => {
    const f = evaluateSessionHealth({
      session: session({ status: 'complete' }),
      components: scaffold([item('confirmed'), item('confirmed', 'a')]),
      paragraphCount: 2, studentTurns: 6, studentChars: 900, turnsBeforeScaffold: 2,
    })
    expect(f).toEqual([])
  })
})

describe('ordering + roll-up', () => {
  it('sorts worst first', () => {
    const f = evaluateSessionHealth({
      session: session({ truncated_turns: 1 }),
      components: scaffold([item('confirmed')]), paragraphCount: 0,
    })
    expect(f[0].severity).toBe('critical')
    expect(worstSeverity(f)).toBe('critical')
  })
  it('worstSeverity is null when healthy', () => {
    expect(worstSeverity([])).toBeNull()
  })
})
