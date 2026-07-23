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
