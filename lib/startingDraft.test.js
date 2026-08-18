import { describe, it, expect } from 'vitest'
import {
  countDraftWords, validateStartingDraft, hasConfirmedWork,
  MAX_STARTING_DRAFT_CHARS, STARTING_DRAFT_SOURCES,
} from '@/lib/startingDraft'

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
