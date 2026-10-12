import { describe, it, expect } from 'vitest'
import {
  splitDraftParagraphs, shouldUseDraftShape, draftSectionCount, buildDraftComponentTree,
  draftScaffoldTree, isDraftShapedScaffold, MAX_DRAFT_SECTIONS, MAX_SCAFFOLD_SECTIONS,
} from './startingDraftScaffold'
import { growComponents } from './scaffoldGrowth'
import { computeActualLive } from './requirements'

// Synthetic drafts (public repo).
const FIVE = ['One two three.', 'Four five six.', 'Seven eight.', 'Nine ten.', 'Eleven.'].join('\n\n')

describe('splitDraftParagraphs', () => {
  it('splits on blank lines (including lines of only spaces) and trims', () => {
    expect(splitDraftParagraphs(FIVE)).toHaveLength(5)
    expect(splitDraftParagraphs('A one.\n   \nB two.\r\n\r\nC three.')).toEqual(['A one.', 'B two.', 'C three.'])
  })
  it('ONE block with no breaks is one paragraph — the only real starting-draft session was this', () => {
    expect(splitDraftParagraphs('A long block. Several sentences. No breaks at all.')).toHaveLength(1)
  })
  it('single-newline paragraphs are trusted only when the lines end as sentences', () => {
    expect(splitDraftParagraphs('First paragraph ends.\nSecond one ends too.\nThird.')).toHaveLength(3)
    // Hard-wrapped prose (copied from a PDF) breaks mid-sentence: NOT paragraphs.
    expect(splitDraftParagraphs('The chain came off my bike on the\nsteepest part of the hill and I\nstood there.')).toHaveLength(1)
  })
  it('empty / whitespace / non-string → no paragraphs', () => {
    expect(splitDraftParagraphs('')).toEqual([])
    expect(splitDraftParagraphs('   \n  ')).toEqual([])
    expect(splitDraftParagraphs(null)).toEqual([])
  })
})

describe('draftScaffoldTree — when the shape applies', () => {
  it('prose type + a draft → one part per section, ids c0…, labels Paragraph k, first working', () => {
    const t = draftScaffoldTree('personal_statement', 5, FIVE)
    expect(t).toHaveLength(5)
    t.forEach((s, i) => {
      expect(s).toMatchObject({ index: i, type: 'custom', fromStartingDraft: true })
      expect(s.items).toEqual([{ id: `c${i}`, label: `Paragraph ${i + 1}`, status: i === 0 ? 'working' : 'locked', text: null, nuggetText: null }])
    })
    expect(t[0].status).toBe('working'); expect(t[1].status).toBe('locked')
  })
  it('ids are unique across the WHOLE tree (the premise resolveComponentWrite\'s cross-section path needs)', () => {
    const ids = draftScaffoldTree('essay', 7, FIVE).flatMap(s => s.items.map(i => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('no draft, a non-prose type, or one section → null (the normal builder runs)', () => {
    expect(draftScaffoldTree('personal_statement', 5, '')).toBeNull()
    expect(draftScaffoldTree('personal_statement', 5, undefined)).toBeNull()
    expect(draftScaffoldTree('custom', 5, FIVE)).toBeNull()
    expect(draftScaffoldTree('personal_statement', 1, 'One block only.')).toBeNull()
  })
  it('the count is RAISED to fit every draft paragraph, never lowered', () => {
    expect(draftScaffoldTree('narrative', 3, FIVE)).toHaveLength(5)
    expect(draftScaffoldTree('narrative', 7, FIVE)).toHaveLength(7)
    expect(draftSectionCount(1, 1)).toBe(1)
    expect(draftSectionCount('x', 4)).toBe(4)
  })
  it('a dialogue-heavy draft past MAX_DRAFT_SECTIONS keeps the coach\'s count', () => {
    const many = Array.from({ length: MAX_DRAFT_SECTIONS + 5 }, (_, i) => `"Line ${i}."`).join('\n\n')
    expect(draftScaffoldTree('narrative', 4, many)).toHaveLength(4)
  })
  it('the coach\'s count is clamped to MAX_SCAFFOLD_SECTIONS in every branch (round-2 #6)', () => {
    const many = Array.from({ length: MAX_DRAFT_SECTIONS + 5 }, (_, i) => `"Line ${i}."`).join('\n\n')
    expect(draftScaffoldTree('narrative', 99, many)).toHaveLength(MAX_SCAFFOLD_SECTIONS)
    expect(draftScaffoldTree('narrative', 99, FIVE)).toHaveLength(MAX_SCAFFOLD_SECTIONS)
  })
  it('shouldUseDraftShape covers the prose types only', () => {
    for (const t of ['essay', 'narrative', 'personal_statement']) expect(shouldUseDraftShape(t, FIVE)).toBe(true)
    expect(shouldUseDraftShape('custom', FIVE)).toBe(false)
    expect(shouldUseDraftShape('haiku', FIVE)).toBe(false)
  })
})

describe('isDraftShapedScaffold — structural, survives growth', () => {
  it('true for the built shape, and still true after "+ Add another section"', () => {
    const comps = buildDraftComponentTree(4)
    expect(isDraftShapedScaffold({ components: comps })).toBe(true)
    const grown = growComponents(comps, 1).components
    expect(grown[4].items[0].id).toBe('c4')        // mint continues past the draft ids — no collision
    expect(isDraftShapedScaffold({ components: grown })).toBe(true)
  })
  it('false for four-part prose sections, a one-section scaffold, or nothing', () => {
    expect(isDraftShapedScaffold({ components: [{ type: 'personal_statement', items: [{}, {}, {}, {}] }, { type: 'personal_statement', items: [{}, {}, {}, {}] }] })).toBe(false)
    expect(isDraftShapedScaffold({ components: buildDraftComponentTree(1) })).toBe(false)
    expect(isDraftShapedScaffold(null)).toBe(false)
  })
})

describe('the word count the coach is held to counts a kept paragraph exactly once', () => {
  it('computeActualLive on the draft shape = the confirmed paragraph words; a row for a section wins over its part', () => {
    const comps = buildDraftComponentTree(3)
    comps[0].items[0] = { ...comps[0].items[0], status: 'confirmed', text: 'one two three four' }
    comps[1].items[0] = { ...comps[1].items[0], status: 'confirmed', text: 'five six' }
    expect(computeActualLive([], comps)).toEqual({ words: 6, paragraphs: 2 })
    expect(computeActualLive([{ paragraph_index: 1, scribed_text: 'five six seven' }], comps)).toEqual({ words: 7, paragraphs: 2 })
  })
})
