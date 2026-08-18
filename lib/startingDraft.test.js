import { describe, it, expect } from 'vitest'
import {
  countDraftWords, validateStartingDraft, hasConfirmedWork, MAX_STARTING_DRAFT_CHARS, STARTING_DRAFT_SOURCES, startingDraftSources, classifyStartingDraftRead, provenanceIsTrustworthy, growthSummary, draftOverlapFraction, STARTING_DRAFT_TABLE, startingDraftTiming,
} from '@/lib/startingDraft'
import { checkProvenance } from '@/lib/provenance'

// MERGED FROM TWO LANES (conductor, 2026-08-17 SF): assignment-intake's capture/validation
// tests and coaching-session's read/provenance tests. Both lanes created this file
// independently against a main that did not yet hold the other's.

// The starting draft is the BEFORE in "here is what she arrived with, here is what she has
// now". Every number here ends up in front of a parent, and the row can never be corrected —
// so the rules that decide what gets frozen are worth pinning down.

describe('countDraftWords', () => {
  it('counts words, not whitespace runs', () => {
    expect(countDraftWords('one two three')).toBe(3)
    expect(countDraftWords('  one \n\n two \t three  ')).toBe(3)
    expect(countDraftWords('one\n\ntwo')).toBe(2)
  })

  it('is zero for empty and non-string input', () => {
    for (const v of ['', '   ', '\n\n', null, undefined]) expect(countDraftWords(v)).toBe(0)
  })

  it('matches the splitter used elsewhere in the repo (lib/draftIntegrity countWords)', () => {
    const countWords = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length
    const samples = ['a b  c', ' leading', 'trailing ', 'multi\nline text', '']
    for (const s of samples) expect(countDraftWords(s)).toBe(countWords(s))
  })
})

describe('validateStartingDraft', () => {
  it('accepts a normal paste and reports the stored word count', () => {
    const r = validateStartingDraft({ content: '  The dog barked. It was loud.  ', source: 'pasted' })
    expect(r.ok).toBe(true)
    expect(r.content).toBe('The dog barked. It was loud.')  // edges trimmed
    expect(r.wordCount).toBe(6)
    expect(r.source).toBe('pasted')
  })

  it("preserves the student's interior paragraphing verbatim", () => {
    // This is the immutable record of what they arrived with. Normalising interior
    // whitespace would mean the "before" shown to a parent is not the thing pasted.
    const content = 'Scene one.\n\n\nScene two.\n   indented line'
    const r = validateStartingDraft({ content, source: 'pasted' })
    expect(r.ok).toBe(true)
    expect(r.content).toBe(content)
  })

  it('rejects empty, whitespace-only, and non-string content', () => {
    for (const content of ['', '    ', '\n\t', null, undefined, 42, {}, []]) {
      expect(validateStartingDraft({ content }).ok).toBe(false)
    }
  })

  it('rejects content over the cap and accepts content exactly at it', () => {
    const atCap = 'x'.repeat(MAX_STARTING_DRAFT_CHARS)
    expect(validateStartingDraft({ content: atCap }).ok).toBe(true)
    expect(validateStartingDraft({ content: atCap + 'x' }).ok).toBe(false)
  })

  it('accepts only the sources the schema check constraint allows', () => {
    for (const source of STARTING_DRAFT_SOURCES) {
      expect(validateStartingDraft({ content: 'hi there', source }).ok).toBe(true)
    }
    // A source the DB would reject must fail HERE, or the insert dies on a 23514 the
    // student sees as "could not save your draft".
    for (const source of ['dictated', 'ocr', '', null, 1]) {
      expect(validateStartingDraft({ content: 'hi there', source }).ok).toBe(false)
    }
  })

  it('defaults source to pasted when omitted', () => {
    expect(validateStartingDraft({ content: 'hi there' }).source).toBe('pasted')
  })
})

describe('hasConfirmedWork — the v1 refusal', () => {
  // Past the first lock this is not a baseline, it is a mid-stream paste. Accepting it
  // would backdate work the coach already drew out and inflate the growth artifact.
  it('is false on a brand-new session', () => {
    expect(hasConfirmedWork([], 0)).toBe(false)
    expect(hasConfirmedWork(undefined, undefined)).toBe(false)
  })

  it('is false while sections exist but nothing is locked', () => {
    const components = [
      { index: 0, status: 'empty', items: [{ id: 'topic_sentence', status: 'empty' }] },
      { index: 1, status: 'in_progress', items: [{ id: 'evidence', status: 'draft' }] },
    ]
    expect(hasConfirmedWork(components, 0)).toBe(false)
  })

  it('is true once ANY item is confirmed', () => {
    const components = [
      { index: 0, status: 'in_progress', items: [
        { id: 'topic_sentence', status: 'confirmed' },
        { id: 'evidence', status: 'empty' },
      ] },
    ]
    expect(hasConfirmedWork(components, 0)).toBe(true)
  })

  it('is true once a paragraph is complete', () => {
    expect(hasConfirmedWork([{ index: 0, status: 'complete', items: [] }], 0)).toBe(true)
  })

  it('is true when assembled paragraphs exist even with an empty scaffold', () => {
    // The scaffold can be empty while `paragraphs` holds assembled work — 9 of 27
    // completed sessions have no scaffold at all, so this arm is not hypothetical.
    expect(hasConfirmedWork([], 1)).toBe(true)
  })

  it('survives malformed component rows without throwing', () => {
    expect(hasConfirmedWork([null, undefined, {}, { items: null }], 0)).toBe(false)
  })
})


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

// ── startingDraftTiming ──────────────────────────────────────────────────────
// The v1 refusal is a ROUTE rule, not a boundary: RLS lets a student declare a draft at
// any time, including after finishing (proven live in scripts/starting-draft-gate.mjs
// step 9). Transparency is the mitigation, and it only works if the timing is surfaced —
// so these are the assertions that keep it surfaced.
describe('startingDraftTiming', () => {
  const start = '2026-08-17T10:00:00.000Z'

  it('reads a draft declared during intake as "at the start"', () => {
    const t = startingDraftTiming({ sessionCreatedAt: start, draftCreatedAt: '2026-08-17T10:00:04.000Z' })
    expect(t.atCreation).toBe(true)
    expect(t.minutesAfterStart).toBe(0)
    expect(t.label).toMatch(/at the start/)
  })

  it('reports the gap for one declared later', () => {
    const t = startingDraftTiming({ sessionCreatedAt: start, draftCreatedAt: '2026-08-17T10:47:00.000Z' })
    expect(t.minutesAfterStart).toBe(47)
    expect(t.atCreation).toBe(false)
    expect(t.label).toMatch(/47 min after starting/)
  })

  it('says so plainly when it was declared after work was locked', () => {
    const t = startingDraftTiming({
      sessionCreatedAt: start,
      draftCreatedAt: '2026-08-17T10:47:00.000Z',
      firstLockAt: '2026-08-17T10:20:00.000Z',
    })
    expect(t.afterFirstLock).toBe(true)
    expect(t.label).toMatch(/after work was already locked/)
  })

  it('is false — not null — when the draft genuinely predates the first lock', () => {
    const t = startingDraftTiming({
      sessionCreatedAt: start,
      draftCreatedAt: '2026-08-17T10:00:30.000Z',
      firstLockAt: '2026-08-17T10:20:00.000Z',
    })
    expect(t.afterFirstLock).toBe(false)
  })

  it('returns UNKNOWN, never false, when the lock time is missing', () => {
    // The trap: an absent lock time defaulting to `false` would render as "declared
    // before any work" — an unearned reassurance about the exact thing being checked.
    for (const firstLockAt of [null, undefined, '', 'not-a-date']) {
      expect(startingDraftTiming({ sessionCreatedAt: start, draftCreatedAt: start, firstLockAt }).afterFirstLock).toBe(null)
    }
  })

  it('never invents a timing from unparseable timestamps', () => {
    const t = startingDraftTiming({ sessionCreatedAt: 'nope', draftCreatedAt: undefined })
    expect(t.minutesAfterStart).toBe(null)
    expect(t.atCreation).toBe(null)
    expect(t.label).toMatch(/unknown time/)
  })

  it('clamps a draft stamped before the session to zero rather than going negative', () => {
    const t = startingDraftTiming({ sessionCreatedAt: start, draftCreatedAt: '2026-08-17T09:59:00.000Z' })
    expect(t.minutesAfterStart).toBe(0)
  })
})
