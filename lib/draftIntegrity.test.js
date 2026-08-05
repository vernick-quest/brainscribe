import { describe, it, expect } from 'vitest'
import { checkDraftIntegrity, renderedDraftText, missingWords } from './draftIntegrity'

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

  // ── The regression that matters — and the deliberate gap around it ─────────────────
  it("the 2026-07-20 shape is NOT inferable from stored state, and that is on purpose", () => {
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

    // This shape is structurally IDENTICAL to two healthy cases: a component the coach
    // deliberately skipped, and a session we already repaired (restored prose lives in
    // the paragraph rows, leaving the old slots empty forever). Reporting it meant two
    // permanent, unfixable entries on the alert screen — which is how a monitor stops
    // being read. The word shortfall can't rescue it either: the target is a ceiling
    // ("up to 250 words"), so writing less is a student's choice.
    expect(r.orphanedWords).toBe(0)
    expect(r.severity).toBe('none')
    expect(r.unfilledComponents).toEqual(['p0:reflection', 'p0:connection'])
    expect(r.shortfallPct).toBeGreaterThanOrEqual(30)   // still visible as context

    // The SAME session, once the client records the drop as it happens, alerts loudly.
    // That is the replacement: evidence instead of inference. Any future occurrence goes
    // through resolveDoneText, which sets this flag.
    const withRecord = [section([
      item('hook', 'It was late afternoon and I was sitting at my table,'),
      item('context', 'typing then deleting.'),
      { ...item('reflection', null, 'working'), writeDropped: true },
      item('connection', null, 'locked'),
    ])]
    const r2 = checkDraftIntegrity(paragraphs, withRecord, {
      currentParagraphIndex: 1, status: 'complete', targetWords: 250,
    })
    expect(r2.severity).toBe('alert')
    expect(r2.droppedComponents).toEqual(['p0:reflection'])
  })

  it('does not fire on an in-progress session with empty components', () => {
    // Mid-session emptiness is normal — only a COMPLETE session should alert.
    const r = checkDraftIntegrity([{ scribed_text: 'A start.' }], [section([
      item('hook', 'A start.'),
      item('reflection', null, 'working'),
    ])], { currentParagraphIndex: 0, status: 'active', targetWords: 250 })
    expect(r.severity).toBe('none')
  })

  it('does NOT flag a short finished essay — the target is a ceiling, not a floor', () => {
    // "Up to 250 words" means a student who writes fewer has made a choice. The shortfall
    // is still reported as context, it just isn't a defect.
    const r = checkDraftIntegrity([{ scribed_text: 'Four words only here.' }], [section([
      item('hook', 'Four words only here.'),
    ])], { currentParagraphIndex: 1, status: 'complete', targetWords: 250 })
    expect(r.severity).toBe('none')
    expect(r.shortfallPct).toBeGreaterThan(90)   // still surfaced, just not flagged
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

// ── False positives that made the alert screen untrustworthy (found 2026-07-28) ───────
// After the first five sessions were restored, the audit still reported 4 flags. Every
// one of the remaining ALERTs turned out to be healthy. An alert list that is mostly
// noise gets skimmed, which defeats the point of having it.
describe('checkDraftIntegrity — telling a skipped component from a lost one', () => {
  const skip = (id) => ({ id, label: id, status: 'locked', text: null, nuggetText: null })
  const dropped = (id) => ({ ...skip(id), writeDropped: true })

  it('does NOT alert when the coach deliberately skipped a component (Lyndsay 2026-07-27)', () => {
    // Real shape: a two-paragraph quick write with no word target. The coach said
    // "we don't really need a roadmap — the thesis does enough work on its own", and
    // never asked for a thesis restatement either. Every word she confirmed is in the
    // draft. This was reported as ALERT and it should not have been.
    const paragraphs = [
      { scribed_text: 'I spent my lunchtime feeling really uncomfortable. I was not sure how to react.' },
      { scribed_text: 'I would like to see more debate in our classes so I am ready later.' },
    ]
    const components = [
      section([item('hook', 'I spent my lunchtime feeling really uncomfortable.'), skip('roadmap')]),
      section([item('closing', 'so I am ready later'), skip('thesis_restate')]),
    ]
    const r = checkDraftIntegrity(paragraphs, components, {
      currentParagraphIndex: 2, status: 'complete', targetWords: null,
    })
    // Nothing orphaned, no recorded drop, no target, and the draft doesn't even render
    // from the scaffold — there is no evidence of loss here to report.
    expect(r.severity).toBe('none')
    expect(r.droppedComponents).toEqual([])
    expect(r.renderedFromParagraphs).toBe(true)
  })

  it('does NOT alert on a RESTORED session whose prose lives in paragraph rows', () => {
    // The restore writes recovered text into `paragraphs`; the scaffold components stay
    // empty because that is not where the draft renders from. The fix must not create a
    // permanent alert for every session it repaired.
    const paragraphs = [{ scribed_text: 'Standing in a giant convention center, the ref said go.' }]
    const components = [section([item('hook', 'Standing in a giant convention center'), skip('body'), skip('closing')])]
    const r = checkDraftIntegrity(paragraphs, components, {
      currentParagraphIndex: 1, status: 'complete', targetWords: null,
    })
    // A repaired session must not keep a permanent entry on the alert screen.
    expect(r.severity).toBe('none')
  })

  it('the cursor sentinel alone never escalates — it is true of every healthy session', () => {
    const r = checkDraftIntegrity([{ scribed_text: 'All done here now.' }], [section([
      item('hook', 'All done here now.'), skip('roadmap'),
    ])], { currentParagraphIndex: 1, status: 'complete', targetWords: 250 })
    expect(r.cursorOutOfRange).toBe(true)
    // 250w target vs 4 words is a huge shortfall, so this DOES alert — but on the
    // shortfall, never on the cursor. The cursor line is context only.
    expect(r.reasons.join(' ')).toMatch(/normal at completion/)
    expect(r.reasons.find(x => /cursor/.test(x))).not.toMatch(/signature|dropped/)
  })

  it('DOES alert on a recorded dropped lock-in, even with no target and no shortfall', () => {
    // Elio's 2026-06-26 shape, as it would be captured going forward: the coach said
    // "Body is locked in", the write carried no text, the client recorded the drop.
    const paragraphs = [{ scribed_text: 'Have you ever dreamt of exploring space?' }]
    const components = [section([item('hook', 'Have you ever dreamt of exploring space?'), dropped('body')])]
    const r = checkDraftIntegrity(paragraphs, components, {
      currentParagraphIndex: 0, status: 'complete', targetWords: null,
    })
    expect(r.severity).toBe('alert')
    expect(r.droppedComponents).toEqual(['p0:body'])
    expect(r.reasons.join(' ')).toMatch(/DROPPED lock-in/)
  })

  it('orphaned text still alerts regardless of targets or paragraph rows', () => {
    // The one inference that remains trustworthy: the scaffold holds text the Final Draft
    // does not render. That is a literal working-vs-final disconnect, not a guess.
    const r = checkDraftIntegrity([{ scribed_text: 'Only the hook survived here.' }], [section([
      item('hook', 'Only the hook survived here.'),
      item('reflection', 'I learned that asking for help is how anyone actually improves.'),
    ])], { currentParagraphIndex: 1, status: 'complete', targetWords: null })
    expect(r.severity).toBe('alert')
    expect(r.orphanedWords).toBeGreaterThan(0)
    expect(r.renderedFromParagraphs).toBe(true)
  })
})

describe('checkDraftIntegrity — a scaffold-rendered draft still reports its holes', () => {
  const skip = (id) => ({ id, label: id, status: 'locked', text: null, nuggetText: null })

  it('warns when there are no paragraph rows, because the holes are what the student sees', () => {
    // No paragraphs means the scaffold IS the Final Draft, so an empty slot is a visible
    // gap in the essay rather than an unused structural slot. The "no evidence" downgrade
    // must not swallow this case.
    const r = checkDraftIntegrity([], [{
      index: 0, type: 'personal_statement', status: 'complete',
      items: [
        { id: 'hook', label: 'hook', status: 'confirmed', text: 'Have you ever dreamt of exploring space?', nuggetText: null },
        skip('body'),
      ],
    }], { currentParagraphIndex: 1, status: 'complete', targetWords: null })
    expect(r.renderedFromParagraphs).toBe(false)
    expect(r.severity).toBe('warn')
    expect(r.reasons.join(' ')).toMatch(/may never have been saved/)
  })
})

describe('checkDraftIntegrity — broken commitments are proof, not inference', () => {
  const skip = (id) => ({ id, label: id, status: 'locked', text: null, nuggetText: null })

  it('ALERTS on a broken promise even with a healthy word count and no target', () => {
    // This is what restores the coverage the word-count heuristic used to provide, without
    // the false positives: the coach said it was saved, and it isn't.
    const r = checkDraftIntegrity([{ scribed_text: 'A perfectly normal looking draft here.' }], [section([
      item('hook', 'A perfectly normal looking draft here.'), skip('body'),
    ])], {
      currentParagraphIndex: 1, status: 'complete', targetWords: null,
      brokenCommitments: ['body'],
    })
    expect(r.severity).toBe('alert')
    expect(r.reasons.join(' ')).toMatch(/coach said 1 component\(s\) were locked in/)
  })

  it('stays clean when no commitment was broken', () => {
    const r = checkDraftIntegrity([{ scribed_text: 'A perfectly normal looking draft here.' }], [section([
      item('hook', 'A perfectly normal looking draft here.'), skip('roadmap'),
    ])], {
      currentParagraphIndex: 1, status: 'complete', targetWords: null, brokenCommitments: [],
    })
    expect(r.severity).toBe('none')
  })
})

// ── The alert's own arithmetic (Baron's Gratitude Letter, 2026-08-04) ────────────────
// The card read "Final draft 31w · working draft 182w · 151w missing". 31 + 151 = 182,
// but the 151w component CONTAINED that 31w opening in revised form, so the shared
// sentence was counted twice. The restore then produced 151w — contradicting the alert by
// exactly the overlap. A human noticed; the tooling did not.
describe('checkDraftIntegrity — never double-count an overlapping orphan', () => {
  const OPENING_OLD = 'Writing used to be a big and confusing task for me, but you made a thing that asks me questions and broke it down into smaller and easier parts to understand.'
  const FULL_LETTER = 'Dear Dad, Writing used to be a big and confusing task for me, but you made a tool that asks me questions and broke it down into smaller and easier parts to comprehend. It helped me complete my writing assignments and reduced the stress I had when writing. I am very grateful and thankful for you making a tool for me to use when writing.'

  it('reports only what is genuinely absent, not final + orphan', () => {
    const r = checkDraftIntegrity(
      [{ scribed_text: OPENING_OLD }],
      [section([{ id: 'c0', label: 'Letter', status: 'candidate', text: FULL_LETTER, nuggetText: null }])],
      { currentParagraphIndex: 0, status: 'complete', targetWords: null },
    )
    expect(r.severity).toBe('alert')                     // still a real loss
    // The revised opening sentence must NOT be counted as missing — it is already on screen.
    expect(r.orphanedWords).toBeLessThan(countWordsIn(FULL_LETTER))
    expect(r.orphanedWords).toBeGreaterThan(0)
    // The old bug: workingWords === finalWords + full orphan length.
    expect(r.workingWords).toBeLessThan(r.finalWords + countWordsIn(FULL_LETTER))
  })

  it('an orphan wholly absent from the draft still counts in full', () => {
    // The de-duplication must not quietly shrink a genuine, unrelated loss.
    const unrelated = 'The tournament was in Las Vegas. I cut forty pounds to make weight.'
    const r = checkDraftIntegrity(
      [{ scribed_text: 'Something completely different about gardening.' }],
      [section([{ id: 'c0', label: 'x', status: 'candidate', text: unrelated, nuggetText: null }])],
      { currentParagraphIndex: 0, status: 'complete', targetWords: null },
    )
    expect(r.orphanedWords).toBe(countWordsIn(unrelated))
  })

  it('missingWords ignores a sentence already present, even lightly reworded', () => {
    const finalNorm = 'writing used to be a big and confusing task for me but you made a thing'
    expect(missingWords('Writing used to be a big and confusing task for me, but you made a tool.', finalNorm)).toBe(0)
  })
})

function countWordsIn(s) { return s.trim().split(/\s+/).filter(Boolean).length }

// ── survivalRatio must not be fooled by reused vocabulary (red-team, 2026-08-04) ─────
describe('missingWords — ordered runs, not word membership', () => {
  it('counts a lost sentence whose words all appear ELSEWHERE in the draft', () => {
    // A conclusion restates the essay by design, so every content word recurs. Membership
    // scoring called this "present" and under-reported the loss.
    const draft = 'soccer taught me about discipline. my best games came from believing. my teammates mattered.'
    const lostConclusion = 'Discipline from soccer taught me that my teammates believing in my best games mattered.'
    expect(missingWords(lostConclusion, draft)).toBeGreaterThan(0)
  })

  it('still treats a lightly reworded sentence as present', () => {
    // The tolerance exists for scribe edits — a couple of word swaps must not read as loss.
    const draft = 'writing used to be a big and confusing task for me but you made a thing that asks me questions'
    const reworded = 'Writing used to be a big and confusing task for me, but you made a tool that asks me questions.'
    expect(missingWords(reworded, draft)).toBe(0)
  })

  it('counts a sentence made only of short words instead of silently passing it', () => {
    // "I am so mad at my mom." has no >3-char content words. It used to score 1 — present —
    // so it could never be reported missing anywhere.
    expect(missingWords('I am so mad at my mom.', 'a totally unrelated draft about trains')).toBeGreaterThan(0)
  })

  it('an orphan wholly absent from the draft is still counted in full', () => {
    const gone = 'The tournament was in Las Vegas. I cut forty pounds to make weight.'
    expect(missingWords(gone, 'something about gardening')).toBe(gone.trim().split(/\s+/).length)
  })
})
