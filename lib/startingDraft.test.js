import { describe, it, expect } from 'vitest'
import {
  startingDraftSources, classifyStartingDraftRead, provenanceIsTrustworthy,
  growthSummary, draftOverlapFraction, STARTING_DRAFT_TABLE,
} from '@/lib/startingDraft'
import { checkProvenance } from '@/lib/provenance'

// Synthetic throughout — this repo is public and no real student text goes in a tracked file.
const STARTING = `The lighthouse had been dark for eleven winters before Mara climbed it.
Her grandmother had kept the lamp once, back when the harbour still had boats worth guiding
home, and the brass fittings still carried the shape of her hands. Mara counted the steps
the way she had been taught, sixty-two of them, and did not look down.`

describe('the seam — startingDraftSources', () => {
  it('names the table once so the two lanes cannot drift', () => {
    expect(STARTING_DRAFT_TABLE).toBe('session_starting_drafts')
  })

  it('yields the content as a student source', () => {
    expect(startingDraftSources({ content: STARTING })).toEqual([STARTING])
  })

  it('yields nothing for an absent, empty or malformed draft', () => {
    for (const d of [null, undefined, {}, { content: '' }, { content: '   ' }, { content: 42 }]) {
      expect(startingDraftSources(d)).toEqual([])
    }
  })
})

// ⚠️ THE REGRESSION THAT PROVES THE WIRING LANDED (spec, Verification).
// A lock drawn from the starting draft must score novelFraction near 0, not 1.0.
describe('a lock drawn from the starting draft is the student\'s own writing', () => {
  const lock = 'Her grandmother had kept the lamp once, back when the harbour still had boats'

  it('scores as coach-authored when the starting draft is NOT in studentSources', () => {
    const before = checkProvenance(lock, [])          // today's array, for this student
    expect(before.novelFraction).toBe(1)
    expect(before.pass).toBe(false)                   // recorded as passed=false — fabricated
  })

  it('scores as the student\'s own once the starting draft IS in studentSources', () => {
    const after = checkProvenance(lock, startingDraftSources({ content: STARTING }))
    expect(after.novelFraction).toBe(0)
    expect(after.pass).toBe(true)
  })

  it('and the fix is the sources array, not the threshold', () => {
    // Same text, same threshold, opposite verdict — the only variable is the source list.
    const opts = { noveltyThreshold: 0.34 }
    expect(checkProvenance(lock, [], opts).pass).toBe(false)
    expect(checkProvenance(lock, [STARTING], opts).pass).toBe(true)
  })
})

describe('classifyStartingDraftRead — an unknown failure is not an absent draft', () => {
  it('present / absent when the read succeeded', () => {
    expect(classifyStartingDraftRead(null, { content: 'x' })).toBe('present')
    expect(classifyStartingDraftRead(null, null)).toBe('absent')
  })

  it('recognises both of PostgREST\'s missing-table codes', () => {
    expect(classifyStartingDraftRead({ code: '42P01' })).toBe('no-table')
    expect(classifyStartingDraftRead({ code: 'PGRST205' })).toBe('no-table')
  })

  it('treats anything else as unknown — RLS, network, a transient 5xx', () => {
    expect(classifyStartingDraftRead({ code: '42501' })).toBe('unknown')
    expect(classifyStartingDraftRead({ code: 'PGRST301' })).toBe('unknown')
    expect(classifyStartingDraftRead({ message: 'fetch failed' })).toBe('unknown')
  })

  it('only `unknown` makes a provenance check untrustworthy', () => {
    expect(provenanceIsTrustworthy('present')).toBe(true)
    expect(provenanceIsTrustworthy('absent')).toBe(true)
    // Pre-migration NO session can have a starting draft, so scoring without one is exact.
    expect(provenanceIsTrustworthy('no-table')).toBe(true)
    // We cannot tell whether this session has one, so we cannot trust the score.
    expect(provenanceIsTrustworthy('unknown')).toBe(false)
  })
})

describe('growthSummary — stated as growth, never as total output', () => {
  it('produces the artifact from the spec', () => {
    const g = growthSummary({ startingWordCount: 800, draftWords: 40 })
    expect(g.headline).toBe('Arrived with 800 words, added 40')
    expect(g).toMatchObject({ arrivedWith: 800, addedWords: 40, hasStartingDraft: true })
  })

  // The reason this is not `draftWords - startingWordCount`: arriving with more than you
  // add is the COMMON case, and a subtraction reports it as negative growth.
  it('does not subtract — arriving with 800 and adding 40 is +40, not -760', () => {
    expect(growthSummary({ startingWordCount: 800, draftWords: 40 }).addedWords).toBe(40)
  })

  it('reads as no starting draft when there is none', () => {
    for (const args of [undefined, {}, { startingWordCount: 0, draftWords: 120 }]) {
      expect(growthSummary(args).hasStartingDraft).toBe(false)
    }
  })

  it('never renders NaN or a negative from a degenerate input', () => {
    const g = growthSummary({ startingWordCount: NaN, draftWords: -5 })
    expect(g.arrivedWith).toBe(0)
    expect(g.addedWords).toBe(0)
    expect(g.headline).not.toMatch(/NaN|-/)
  })

  it('groups thousands, and gets the singular right', () => {
    expect(growthSummary({ startingWordCount: 1227, draftWords: 0 }).headline)
      .toBe('Arrived with 1,227 words, added 0')
    expect(growthSummary({ startingWordCount: 1, draftWords: 2 }).headline)
      .toBe('Arrived with 1 word, added 2')
  })
})

// The named limit: re-pasting the starting draft inflates "added". Measured, not guessed at,
// and deliberately WITHOUT a threshold — the number is shown, the reader judges.
describe('draftOverlapFraction — how much of the draft is re-entered text', () => {
  it('is ~1 when the working draft is the starting draft pasted back in', () => {
    expect(draftOverlapFraction(STARTING, STARTING)).toBe(1)
  })

  it('is 0 for genuinely new writing', () => {
    expect(draftOverlapFraction(STARTING, 'Quantum tunnelling explains alpha decay rates.')).toBe(0)
  })

  it('lands in between for a partial re-paste', () => {
    const mixed = 'The lighthouse had been dark for eleven winters. Quantum tunnelling explains decay.'
    const f = draftOverlapFraction(STARTING, mixed)
    expect(f).toBeGreaterThan(0)
    expect(f).toBeLessThan(1)
  })

  it('is 0 rather than NaN when either side has no content words', () => {
    expect(draftOverlapFraction(STARTING, '')).toBe(0)
    expect(draftOverlapFraction('', 'some real words here')).toBe(0)
    expect(draftOverlapFraction(null, null)).toBe(0)
  })

  it('uses provenance\'s tokenizer, so it cannot disagree with lock-time scoring', () => {
    const lock = 'Her grandmother had kept the lamp once'
    expect(draftOverlapFraction(STARTING, lock)).toBe(1)
    expect(checkProvenance(lock, [STARTING]).novelFraction).toBe(0)
  })
})
