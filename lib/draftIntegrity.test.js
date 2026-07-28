import { describe, it, expect } from 'vitest'
import { checkDraftIntegrity, renderedDraftText } from './draftIntegrity'

const item = (id, text, status = 'confirmed') => ({ id, label: id, status, text, nuggetText: null })
const section = (items, extra = {}) => ({ index: 0, type: 'personal_statement', status: 'working', items, ...extra })

describe('checkDraftIntegrity', () => {
  it('a healthy session is clean', () => {
    const paragraphs = [{ scribed_text: 'The dog barked loudly at the mail carrier every single morning.' }]
    const components = [section([
      item('hook', 'The dog barked loudly'),
      item('context', 'at the mail carrier every single morning'),
    ])]
    const r = checkDraftIntegrity(paragraphs, components, {
      currentParagraphIndex: 0, status: 'complete', targetWords: 10,
    })
    expect(r.ok).toBe(true)
    expect(r.severity).toBe('none')
    expect(r.orphanedWords).toBe(0)
  })

  it('does NOT double-count scaffold text already present in the paragraph', () => {
    // The scaffold normally duplicates what was scribed. Summing the two would report
    // phantom data loss on every healthy session.
    const shared = 'Rain fell on the tin roof for three straight days.'
    const r = checkDraftIntegrity([{ scribed_text: shared }], [section([item('hook', shared)])], {
      currentParagraphIndex: 0,
    })
    expect(r.orphanedWords).toBe(0)
    expect(r.workingWords).toBe(r.finalWords)
  })

  it('flags content that exists in the scaffold but not in the rendered draft', () => {
    // Signal 1: the literal "working draft longer than final draft" case.
    const paragraphs = [{ scribed_text: 'Only the opening survived the save.' }]
    const components = [section([
      item('hook', 'Only the opening survived the save.'),
      item('reflection', 'This entire reflection sentence never reached the final draft at all.'),
    ])]
    const r = checkDraftIntegrity(paragraphs, components, { status: 'complete', currentParagraphIndex: 0 })
    expect(r.severity).toBe('alert')
    expect(r.orphanedComponents).toContain('reflection')
    expect(r.orphanedWords).toBeGreaterThan(8)
    expect(r.workingWords).toBeGreaterThan(r.finalWords)
  })

  // ── The regression that matters ────────────────────────────────────────────────────
  it("catches the 2026-07-20 loss, which a pure length-diff would MISS", () => {
    // Reproduces the real shape: a completed personal statement whose scaffold holds
    // hook + context (duplicating the one saved paragraph) while reflection and
    // connection sit empty, and the cursor has advanced past the only section.
    //
    // Working and final are IDENTICAL here — the lost text never reached the scaffold
    // either. Signal 1 alone reports nothing. Signal 2 is what catches it.
    const opening = 'It was late afternoon and I was sitting at my table, typing then deleting.'
    const paragraphs = [{ scribed_text: opening }]
    const components = [section([
      item('hook', 'It was late afternoon and I was sitting at my table,'),
      item('context', 'typing then deleting.'),
      item('reflection', null, 'working'),
      item('connection', null, 'locked'),
    ])]

    const r = checkDraftIntegrity(paragraphs, components, {
      currentParagraphIndex: 1,   // past the only section — the fingerprint
      status: 'complete',
      targetWords: 250,
    })

    expect(r.orphanedWords).toBe(0)          // length-diff sees nothing wrong…
    expect(r.severity).toBe('alert')         // …but the check still fires
    expect(r.unfilledComponents).toEqual(['p0:reflection', 'p0:connection'])
    expect(r.cursorOutOfRange).toBe(true)
    expect(r.shortfallPct).toBeGreaterThanOrEqual(30)
    expect(r.reasons.join(' ')).toMatch(/empty component/)
  })

  it('does not fire on an in-progress session with empty components', () => {
    // Mid-session emptiness is normal — only a COMPLETE session should alert.
    const r = checkDraftIntegrity([{ scribed_text: 'A start.' }], [section([
      item('hook', 'A start.'),
      item('reflection', null, 'working'),
    ])], { currentParagraphIndex: 0, status: 'active', targetWords: 250 })
    expect(r.severity).toBe('none')
  })

  it('warns (not alerts) on a short finished essay with a complete scaffold', () => {
    const r = checkDraftIntegrity([{ scribed_text: 'Four words only here.' }], [section([
      item('hook', 'Four words only here.'),
    ])], { currentParagraphIndex: 1, status: 'complete', targetWords: 250 })
    expect(r.severity).toBe('warn')
    expect(r.shortfallPct).toBeGreaterThan(90)
  })

  it('handles a scaffold-only session (no paragraphs yet)', () => {
    const r = checkDraftIntegrity([], [section([item('hook', 'Just the hook so far.')])], {
      currentParagraphIndex: 0, status: 'active',
    })
    expect(r.finalWords).toBe(5)
    expect(r.ok).toBe(true)
  })

  it('survives empty / malformed input without throwing', () => {
    expect(() => checkDraftIntegrity()).not.toThrow()
    expect(() => checkDraftIntegrity(null, null, {})).not.toThrow()
    expect(checkDraftIntegrity([], []).ok).toBe(true)
  })
})

describe('renderedDraftText', () => {
  it('mirrors the transcript: paragraphs win when present', () => {
    const text = renderedDraftText(
      [{ scribed_text: 'From the paragraph.' }],
      [section([item('hook', 'From the scaffold.')])]
    )
    expect(text).toBe('From the paragraph.')
  })

  it('falls back to scaffold lines when there are no paragraphs', () => {
    const text = renderedDraftText([], [section([item('hook', 'From the scaffold.')])])
    expect(text).toBe('From the scaffold.')
  })
})
