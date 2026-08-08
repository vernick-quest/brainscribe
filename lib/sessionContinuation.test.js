import { describe, it, expect } from 'vitest'
import {
  buildContinuationSession,
  buildContinuationScaffold,
  buildContinuationParagraphs,
  buildContinuationSources,
} from '@/lib/sessionContinuation'
import { resolveWriteIndex } from '@/lib/scaffoldWrite'

// Synthetic v1 fixtures only (public repo — no real student content).
const v1 = {
  id: 'v1-uuid',
  student_id: 'stu-1',
  assignment_text: 'Write a 3-paragraph essay on the Dust Bowl.',
  persona: 'tilly',
  subject: 'history',
  subject_custom_label: null,
  title: 'Dust Bowl essay',
  status: 'complete',
  is_onboarding: false,
  version: 1,
  completed_at: '2026-08-08T00:00:00Z',
  writing_profile: { tone: 'x' },
  gym_session_id: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-08T00:00:00Z',
  last_active_at: '2026-08-08T00:00:00Z',
  requirements: { targets: [{ type: 'words', min: 300, label: 'at least 300 words' }], actual: { words: 999, paragraphs: 9 } },
}
const v1Paragraphs = [
  { id: 'p1', session_id: 'v1-uuid', position: 0, paragraph_index: 0, paragraph_type: 'introduction', scribed_text: 'The Dust Bowl was a disaster.', raw_spoken_text: 'the dust bowl was a disaster', is_thin: false, created_at: 'x' },
  { id: 'p2', session_id: 'v1-uuid', position: 1, paragraph_index: 1, paragraph_type: 'body', scribed_text: 'Families moved west to survive.', raw_spoken_text: 'families moved west', is_thin: true, created_at: 'x' },
]
const v1Components = [{ index: 0, type: 'introduction', status: 'complete', items: [{ id: 'hook', status: 'confirmed', text: 'The Dust Bowl was a disaster.' }] }]

describe('buildContinuationSession', () => {
  const v2 = buildContinuationSession(v1, v1Paragraphs, v1Components)

  it('carries the assignment forward (text, persona, subject, student)', () => {
    expect(v2.assignment_text).toBe(v1.assignment_text)
    expect(v2.persona).toBe('tilly')
    expect(v2.subject).toBe('history')
    expect(v2.student_id).toBe('stu-1')
  })

  it('starts a fresh ACTIVE, non-onboarding row linked back to v1, version bumped', () => {
    expect(v2.status).toBe('active')
    expect(v2.is_onboarding).toBe(false)
    expect(v2.continued_from).toBe('v1-uuid')
    expect(v2.version).toBe(2)
  })

  it('DROPS fields that must not carry (no completed_at / profile / gym / stale id)', () => {
    expect(v2.completed_at).toBeUndefined()
    expect(v2.writing_profile).toBeUndefined()
    expect(v2.gym_session_id).toBeUndefined()
    expect(v2.id).toBeUndefined()
    expect(v2.created_at).toBeUndefined()
    expect(v2.last_active_at).toBeUndefined()
  })

  it('inherits targets but RECOMPUTES actual from the carried draft (never copies stale)', () => {
    expect(v2.requirements.targets).toEqual(v1.requirements.targets)
    // 6 ("The Dust Bowl was a disaster.") + 5 ("Families moved west to survive.") = 11.
    expect(v2.requirements.actual).toEqual({ words: 11, paragraphs: 2 })
    expect(v2.requirements.actual.words).not.toBe(999)  // the stale v1 actual is gone
  })

  it('version defaults sanely when v1.version is missing (treats as 1 → v2)', () => {
    const { version, ...rest } = v1
    expect(buildContinuationSession(rest, [], []).version).toBe(2)
  })

  it('no requirements on v1 → none fabricated on v2', () => {
    const { requirements, ...rest } = v1
    expect(buildContinuationSession(rest, v1Paragraphs, v1Components).requirements).toBeUndefined()
  })

  it('WHITELIST: carries assignment metadata (thesis, outline) but NOT an unknown/future column', () => {
    const withExtras = { ...v1, thesis_statement: 'My thesis', thesis_confirmed: true, outline: { x: 1 }, future_flag_column: 'DANGER' }
    const v2x = buildContinuationSession(withExtras, v1Paragraphs, v1Components)
    expect(v2x.thesis_statement).toBe('My thesis')
    expect(v2x.thesis_confirmed).toBe(true)
    expect(v2x.outline).toEqual({ x: 1 })
    expect(v2x.future_flag_column).toBeUndefined()  // fail-safe: unknown columns never leak into v2
    expect(v2x.onboarding_prompt_key).toBeUndefined()
  })
})

describe('buildContinuationScaffold', () => {
  it('copies components/thesis/counts under the new session id', () => {
    const sc = buildContinuationScaffold({ assignment_type: 'essay', total_paragraphs: 3, current_paragraph_index: 3, components: v1Components, thesis: 'T' }, 'v2-uuid')
    expect(sc.session_id).toBe('v2-uuid')
    expect(sc.components).toBe(v1Components)
    expect(sc.thesis).toBe('T')
    expect(sc.total_paragraphs).toBe(3)
    expect(sc.current_paragraph_index).toBe(3)
    expect(sc.assignment_type).toBe('essay')
  })
  it('null/absent scaffold → null (caller skips the insert)', () => {
    expect(buildContinuationScaffold(null, 'v2')).toBeNull()
    expect(buildContinuationScaffold({}, 'v2')).toBeNull()
  })

  // The cursor is copied VERBATIM on purpose, including v1's out-of-range "all done"
  // sentinel — rewriting it to 0 would falsely claim the student is working on paragraph 0.
  // What makes that safe is that every write path refuses an out-of-range target on a
  // continuation (resolveWriteIndex blockWhenOutOfRange / resolveParagraphWriteIndex),
  // rather than redirecting or reusing the position. See the 2026-08-08 repro: two
  // dictations both took position 3 and the second upserted over the first.
  it('carries v1 sentinel cursor unchanged — the WRITE paths are what must refuse it', () => {
    const sc = buildContinuationScaffold(
      { total_paragraphs: 3, current_paragraph_index: 3, components: [{}, {}, {}] }, 'v2')
    expect(sc.current_paragraph_index).toBe(3)
    expect(sc.current_paragraph_index).toBe(sc.components.length)   // out of range by design
    expect(resolveWriteIndex(sc, { blockWhenOutOfRange: true })).toBeNull()
  })
})

describe('buildContinuationParagraphs', () => {
  const rows = buildContinuationParagraphs(v1Paragraphs, 'v2-uuid')
  it('one verbatim row per v1 paragraph, re-pointed at v2, id/created_at stripped', () => {
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      session_id: 'v2-uuid', scribed_text: 'The Dust Bowl was a disaster.',
      raw_spoken_text: 'the dust bowl was a disaster', position: 0, paragraph_index: 0,
      paragraph_type: 'introduction', is_thin: false,
    })
    expect(rows[0].id).toBeUndefined()
    expect(rows[0].created_at).toBeUndefined()
  })
  it('preserves is_thin and order', () => {
    expect(rows[1].is_thin).toBe(true)
    expect(rows[1].position).toBe(1)
  })
  it('empty/degenerate input → []', () => {
    expect(buildContinuationParagraphs([], 'v2')).toEqual([])
    expect(buildContinuationParagraphs(null, 'v2')).toEqual([])
  })
})

describe('buildContinuationSources', () => {
  it('copies citation metadata under the new session id, id stripped', () => {
    const src = [{ id: 's1', session_id: 'v1-uuid', title: 'NatGeo', author: 'A', publisher: 'NG', published_date: '2021', url: 'https://x', accessed_date: '2026-07-15', origin: 'voice', position: 0 }]
    const rows = buildContinuationSources(src, 'v2-uuid')
    expect(rows[0]).toEqual({ session_id: 'v2-uuid', title: 'NatGeo', author: 'A', publisher: 'NG', published_date: '2021', url: 'https://x', accessed_date: '2026-07-15', origin: 'voice', position: 0 })
    expect(rows[0].id).toBeUndefined()
  })
  it('no sources → []', () => {
    expect(buildContinuationSources([], 'v2')).toEqual([])
  })
})
