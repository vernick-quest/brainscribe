import { describe, it, expect } from 'vitest'
import {
  countWords,
  computeActual,
  computeActualFromDraft,
  scaffoldDraftLines,
  chipState,
  targetDisplay,
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

// targetDisplay composes the neutral count chip with the Rule 14a recommended
// range. It is the ONE function every surface calls, so the live session, the
// dashboard, the watcher transcript and the coach can't quote different numbers.
describe('targetDisplay', () => {
  it('adds a recommended range to a ceiling-only target', () => {
    const d = targetDisplay({ type: 'words', max: 500 }, { words: 382 }, { assignmentType: 'essay' })
    expect(d.full).toBe('382 / 500 words')
    expect(d.range).toMatchObject({ low: 400, high: 450 })
    expect(d.label).toBe('Target: 400–450 · Max: 500')
    expect(d.zone).toBe('below')
  })

  it('reports the zone as the student moves through it', () => {
    const t = { type: 'words', max: 500 }
    const o = { assignmentType: 'essay' }
    expect(targetDisplay(t, { words: 410 }, o).zone).toBe('in')
    expect(targetDisplay(t, { words: 470 }, o).zone).toBe('over')
    expect(targetDisplay(t, { words: 540 }, o).zone).toBe('over-max')
  })

  it('says nothing about a target when the assignment states only a minimum', () => {
    const d = targetDisplay({ type: 'words', min: 300 }, { words: 120 })
    expect(d.full).toBe('120 / 300 words')   // the floor still shows
    expect(d.range).toBeNull()               // but no invented target
    expect(d.label).toBeNull()
  })

  it('leaves paragraph targets alone', () => {
    const d = targetDisplay({ type: 'paragraphs', target: 5 }, { paragraphs: 2 })
    expect(d.full).toBe('2 / 5 paragraphs')
    expect(d.range).toBeNull()
  })

  it('converts a character limit into words for the student', () => {
    const d = targetDisplay({ type: 'chars', max: 1600 }, { words: 200 })
    expect(d.full).toBe('200 / ~267 words')
    expect(d.label).toBe('Target: 240–267 words · Limit: 1600 characters')
  })

  it('never renders a percentage anywhere in what the student sees', () => {
    const d = targetDisplay({ type: 'words', max: 500 }, { words: 382 }, { assignmentType: 'essay' })
    for (const s of [d.full, d.short, d.label]) expect(s).not.toMatch(/%|percent/i)
  })
})

// Red-team findings, locked so they can't come back (2026-08-08).
describe('the red-team findings', () => {
  it('H3: a CHARACTER limit is never rendered as a word goal on a dashboard', () => {
    // chipState is what SessionsList/folder/parent/teacher still call directly.
    // Before the fix this returned "250 / 1600 words" — a goal ~6x the real ceiling.
    const chip = chipState({ type: 'chars', max: 1600 }, { words: 250 })
    expect(chip.full).toBe('250 / ~267 words')
    expect(chip.full).not.toContain('1600')
  })

  it('M1: a character-limited piece CAN reach over-max — it is not stuck on amber', () => {
    expect(targetDisplay({ type: 'chars', max: 1600 }, { words: 400 }).zone).toBe('over-max')
    expect(targetDisplay({ type: 'chars', max: 1600 }, { words: 250 }).zone).toBe('in')
  })

  it('H1: the band follows assignment_type, so a caller that drops it shows a DIFFERENT range', () => {
    // This is the divergence the transcript shipped with: same target, same words,
    // different range, because the query never selected assignment_type.
    const t = { type: 'words', max: 650 }
    const withType = targetDisplay(t, { words: 0 }, { assignmentType: 'personal_statement' })
    const without  = targetDisplay(t, { words: 0 }, { assignmentType: 'default' })
    expect(withType.label).toBe('Target: 585–618 · Max: 650')
    expect(without.label).toBe('Target: 520–585 · Max: 650')
    expect(withType.label).not.toBe(without.label)
  })
})

// The card said "207 / 250–250 words" on three live sessions (2026-08-08).
describe('chipState — what the goal reads as on a card', () => {
  it('collapses an exact count instead of printing 250–250', () => {
    // The real live shape: {"type":"words","min":250,"max":250,"label":"250 words"}
    expect(chipState({ type: 'words', min: 250, max: 250 }, { words: 207 }).full)
      .toBe('207 / 250 words')
  })

  it('names the bound when only ONE is stated — floor and ceiling must not look alike', () => {
    expect(chipState({ type: 'words', max: 250 }, { words: 207 }).full).toBe('207 / 250 words (max)')
    expect(chipState({ type: 'words', min: 250 }, { words: 207 }).full).toBe('207 / 250 words (min)')
  })

  it('leaves a real range and paragraph counts unqualified — they already read clearly', () => {
    expect(chipState({ type: 'words', min: 200, max: 250 }, { words: 207 }).full)
      .toBe('207 / 200–250 words')
    expect(chipState({ type: 'paragraphs', target: 5 }, { paragraphs: 2 }).full)
      .toBe('2 / 5 paragraphs')
  })

  it('keeps `met` meaning what it meant', () => {
    expect(chipState({ type: 'words', min: 250, max: 250 }, { words: 207 }).met).toBe(false)
    expect(chipState({ type: 'words', min: 250, max: 250 }, { words: 250 }).met).toBe(true)
    expect(chipState({ type: 'words', max: 250 }, { words: 207 }).met).toBe(true)
  })
})
