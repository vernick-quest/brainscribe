import { describe, it, expect } from 'vitest'
import {
  countWords,
  computeActual,
  computeActualFromDraft,
  scaffoldDraftLines,
} from '@/lib/requirements'

// Synthetic scaffold shape (mirrors paragraph_scaffolds.components): an array of
// sections, each with an `items` array whose entries carry `.text` (final locked
// text) or `.nuggetText` (dictated nugget). Unreached/locked items have neither.
const scaffold = [
  { items: [
    { id: 'c0', text: 'School should start later in the morning.' }, // 7 words
    { id: 'c1', nuggetText: 'Teens need more sleep to focus.' },      // 6 words
    { id: 'c2' },                                                      // unreached → drops out
  ] },
  { items: [
    { id: 'c3', text: 'Studies back this up.' },                      // 4 words
  ] },
]

describe('scaffoldDraftLines', () => {
  it('extracts text or nuggetText, dropping items with neither', () => {
    expect(scaffoldDraftLines(scaffold)).toEqual([
      'School should start later in the morning.',
      'Teens need more sleep to focus.',
      'Studies back this up.',
    ])
  })

  it('prefers .text over .nuggetText when both present', () => {
    expect(scaffoldDraftLines([{ items: [{ text: 'final', nuggetText: 'raw' }] }]))
      .toEqual(['final'])
  })

  it('is safe on missing / malformed shapes', () => {
    expect(scaffoldDraftLines(null)).toEqual([])
    expect(scaffoldDraftLines(undefined)).toEqual([])
    expect(scaffoldDraftLines([{}])).toEqual([])
    expect(scaffoldDraftLines([{ items: null }])).toEqual([])
  })
})

describe('computeActualFromDraft', () => {
  it('counts scaffold-locked words when no paragraphs are assembled yet (early WIP)', () => {
    // 7 + 6 + 4 = 17 words across three locked lines; no paragraph assembled → 0.
    expect(computeActualFromDraft([], scaffold)).toEqual({ words: 17, paragraphs: 0 })
  })

  it('counts a nuggetText-only scaffold item', () => {
    expect(computeActualFromDraft([], [{ items: [{ nuggetText: 'one two three' }] }]))
      .toEqual({ words: 3, paragraphs: 0 })
  })

  it('prefers assembled paragraphs over the scaffold once they exist', () => {
    const paragraphs = [{ scribed_text: 'This assembled paragraph has six words.' }] // 6 words
    // Scaffold present too, but paragraphs win (matches the transcript essay fallback).
    expect(computeActualFromDraft(paragraphs, scaffold))
      .toEqual(computeActual(paragraphs))
    expect(computeActualFromDraft(paragraphs, scaffold))
      .toEqual({ words: 6, paragraphs: 1 })
  })

  it('returns zeros when neither paragraphs nor scaffold have content', () => {
    expect(computeActualFromDraft([], [])).toEqual({ words: 0, paragraphs: 0 })
    expect(computeActualFromDraft(null, null)).toEqual({ words: 0, paragraphs: 0 })
    expect(computeActualFromDraft([], [{ items: [{ id: 'c0' }] }]))
      .toEqual({ words: 0, paragraphs: 0 })
  })

  it('does not change computeActual paragraphs-only semantics', () => {
    // computeActual still ignores the scaffold entirely.
    expect(computeActual([])).toEqual({ words: 0, paragraphs: 0 })
    expect(countWords('a b c')).toBe(3)
  })
})

// ── The stored count going stale (2026-08-04) ────────────────────────────────────────
// A parent's card read "31 / 0–200 words" on a letter whose draft was 151 words. The
// count is DENORMALISED into sessions.requirements.actual, so it is only ever as true as
// the last thing that remembered to update it. Two ways it lied:
//   1. persistRequirementsActual returned early when `targets` was empty, so `actual`
//      stayed at its creation value of {words:0} forever on completed work.
//   2. It counted `paragraphs` only. A non-prose final (a letter, a haiku) can live in
//      the scaffold with no paragraph rows, and reported 0 for work plainly on screen.
describe('computeActual — the number every card shows', () => {
  it('counts real prose', () => {
    expect(computeActual([{ scribed_text: 'One two three four five.' }]).words).toBe(5)
  })

  it('sums across paragraphs and counts them', () => {
    const r = computeActual([{ scribed_text: 'One two three.' }, { scribed_text: 'Four five.' }])
    expect(r).toEqual({ words: 5, paragraphs: 2 })
  })

  it('is zero for no content — never NaN or undefined on a card', () => {
    expect(computeActual([])).toEqual({ words: 0, paragraphs: 0 })
    expect(computeActual(null)).toEqual({ words: 0, paragraphs: 0 })
  })

  it('ignores blank rows rather than counting them as paragraphs', () => {
    expect(computeActual([{ scribed_text: '   ' }, { scribed_text: 'Two words here.' }]).words).toBe(3)
  })

  it('matches the transcript for a scaffold-only draft (the Gratitude Letter shape)', () => {
    // Text lives in a scaffold component with NO paragraph row. computeActual alone
    // reports 0 — which is what put "31 / 0-200 words" on a parent's card for a 151-word
    // letter. persistRequirementsActual now uses the draft-aware helper instead.
    const letter = 'Dear Dad, thank you for making this tool for me.'
    const components = [{ items: [{ id: 'c0', text: letter }] }]
    expect(computeActual([]).words).toBe(0)
    expect(computeActualFromDraft([], components).words).toBe(10)
  })
})
