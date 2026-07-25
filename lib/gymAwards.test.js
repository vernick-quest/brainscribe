import { describe, it, expect } from 'vitest'
import { loadGymSummaries } from '@/lib/gymAwards'
import { GYM_SKILLS, LEVELS } from '@/lib/gymCurriculum'

// loadGymSummaries is the read the PARENT dashboard uses to surface a child's Skill
// Studio progress. It takes the caller's supabase client (a real parent reads through
// the parent-filtered RLS from migration 025; impersonation passes a service client),
// so the aggregation is testable with a fake client and synthetic rows — no DB, no
// network, no real student data (this repo is public).

/** Minimal PostgREST-shaped stub: .from(t).select(...).in(...) resolves to { data }. */
function fakeClient(tables) {
  return {
    from(table) {
      const rows = tables[table] ?? []
      const q = {
        select: () => q,
        in: (_col, ids) => Promise.resolve({
          data: rows.filter(r => ids.includes(r.student_id)),
        }),
      }
      return q
    },
  }
}

const KID = 'student-a'
const OTHER = 'student-b'

describe('loadGymSummaries', () => {
  it('returns {} for no students without touching the client', async () => {
    const boom = { from() { throw new Error('should not query') } }
    expect(await loadGymSummaries(boom, [])).toEqual({})
    expect(await loadGymSummaries(boom, null)).toEqual({})
    expect(await loadGymSummaries(boom, [null, undefined])).toEqual({})
  })

  it('reports a not-yet-started child instead of a zeroed card', async () => {
    const out = await loadGymSummaries(fakeClient({}), [KID])
    expect(out[KID].started).toBe(false)
    expect(out[KID].earned).toBe(0)
    expect(out[KID].total).toBe(GYM_SKILLS.length)
  })

  it('splits practiced vs locked-in honestly and counts portfolio entries', async () => {
    const out = await loadGymSummaries(fakeClient({
      gym_progress: [{ student_id: KID, current_level: 'builder', current_streak: 3 }],
      gym_skill_state: [
        { student_id: KID, state: 'practiced' },
        { student_id: KID, state: 'practiced' },
        { student_id: KID, state: 'locked_in' },
      ],
      portfolio_entries: [{ student_id: KID }, { student_id: KID }],
    }), [KID])

    expect(out[KID]).toMatchObject({
      level: 'builder', streak: 3, practiced: 2, lockedIn: 1,
      earned: 3, portfolioCount: 2, started: true,
    })
    // earned is the whole badge set; the split must add back up to it.
    expect(out[KID].practiced + out[KID].lockedIn).toBe(out[KID].earned)
  })

  it('resolves the DISPLAY level ladder, not the stored key', async () => {
    const byKey = Object.fromEntries(LEVELS.map(l => [l.key, l.name]))
    for (const key of Object.keys(byKey)) {
      const out = await loadGymSummaries(fakeClient({
        gym_progress: [{ student_id: KID, current_level: key, current_streak: 0 }],
      }), [KID])
      expect(out[KID].levelName).toBe(byKey[key])
      expect(out[KID].levelName).not.toBe(out[KID].level)
    }
    // Unknown/legacy key falls back to the first rung rather than rendering blank.
    const odd = await loadGymSummaries(fakeClient({
      gym_progress: [{ student_id: KID, current_level: 'nonsense', current_streak: 0 }],
    }), [KID])
    expect(odd[KID].levelName).toBe(LEVELS[0].name)
  })

  it('keys strictly by student and never bleeds one child into another', async () => {
    const out = await loadGymSummaries(fakeClient({
      gym_progress: [
        { student_id: KID, current_level: 'craftsman', current_streak: 5 },
        { student_id: OTHER, current_level: 'writer', current_streak: 9 },
      ],
      gym_skill_state: [
        { student_id: KID, state: 'locked_in' },
        { student_id: OTHER, state: 'practiced' },
        { student_id: OTHER, state: 'practiced' },
      ],
      portfolio_entries: [{ student_id: OTHER }],
    }), [KID])

    // Only the requested child is returned, with only their own rows.
    expect(Object.keys(out)).toEqual([KID])
    expect(out[KID]).toMatchObject({ level: 'craftsman', streak: 5, lockedIn: 1, earned: 1, portfolioCount: 0 })
  })

  it('exposes no gate status, percentage, or countdown-computable field', async () => {
    const out = await loadGymSummaries(fakeClient({
      gym_progress: [{ student_id: KID, current_level: 'finder', current_streak: 1 }],
    }), [KID])
    // Growth-framed only (design rule) — the shape is the contract the card renders.
    expect(Object.keys(out[KID]).sort()).toEqual([
      'earned', 'level', 'levelName', 'lockedIn', 'portfolioCount',
      'practiced', 'started', 'streak', 'total',
    ])
  })
})
