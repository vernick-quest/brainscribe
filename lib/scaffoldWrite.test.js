// Regression test for the 2026-07-20 silent data loss.
//
// The functions under test are the ones TutorSession.js calls on every scaffold write.
// They live in lib/ precisely so they can be tested without React or a DOM — the same
// "PURE brain" split as lib/provenance.js and lib/requirements.js.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveWriteIndex, resolveParagraphWriteIndex, updateComponentItem, resolveDoneText, resolveComponentTarget, resolveComponentWrite, shouldPreserveExisting, preserveExistingItem } from './scaffoldWrite'

const item = (id, text = null, status = 'locked') => ({ id, label: id, status, text, nuggetText: null })
const scaffoldOf = (sections, cursor) => ({
  assignment_type: 'personal_statement',
  total_paragraphs: sections.length,
  current_paragraph_index: cursor,
  components: sections,
})
const personalStatement = () => [{
  index: 0, type: 'personal_statement', status: 'working', summary: null,
  items: [
    item('hook', 'It was late afternoon.', 'confirmed'),
    item('context', 'I had an assignment to do.', 'confirmed'),
    item('reflection', null, 'working'),
    item('connection', null, 'locked'),
  ],
}]

let warn, error
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { warn.mockRestore(); error.mockRestore() })

describe('resolveWriteIndex', () => {
  it('passes an in-range cursor straight through', () => {
    expect(resolveWriteIndex(scaffoldOf(personalStatement(), 0))).toBe(0)
    expect(warn).not.toHaveBeenCalled()
  })

  // THE BUG: cursor parked at components.length after the paragraph was finalized with
  // 2 of 4 components still empty. Every later write targeted section 1, which does not
  // exist, and vanished without a trace.
  it('redirects an out-of-range cursor to the section still holding empty components', () => {
    const idx = resolveWriteIndex(scaffoldOf(personalStatement(), 1))
    expect(idx).toBe(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('only 1 section(s) exist'))
  })

  it('falls back to the last section when everything is filled', () => {
    const filled = [{
      index: 0, type: 'personal_statement', status: 'complete', summary: null,
      items: [item('hook', 'a', 'confirmed'), item('context', 'b', 'confirmed')],
    }]
    expect(resolveWriteIndex(scaffoldOf(filled, 1))).toBe(0)
  })

  it('never returns an out-of-range index for a multi-section scaffold', () => {
    const three = [0, 1, 2].map(i => ({
      index: i, type: 'body', status: 'locked', summary: null, items: [item('topic_sentence', 'x', 'confirmed')],
    }))
    for (const cursor of [0, 1, 2, 3, 99, -1]) {
      const idx = resolveWriteIndex(scaffoldOf(three, cursor))
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(3)
    }
  })

  it('tolerates an empty or missing scaffold', () => {
    expect(resolveWriteIndex(null)).toBe(0)
    expect(resolveWriteIndex({ components: [] })).toBe(0)
  })

  // ── blockWhenOutOfRange: "Keep working on this" continuations (2026-08-08) ───────────
  // On a v2 the redirect above stops being a rescue and becomes the loss. Every section
  // is already full of the student's carried v1 words, so "fall back to the last section"
  // means "overwrite the conclusion with work meant for the intro" — reproduced.
  describe('blockWhenOutOfRange (continuation)', () => {
    const carried = [0, 1, 2].map(i => ({
      index: i, type: 'body', status: 'complete', summary: null,
      items: [item('topic_sentence', `carried v1 words ${i}`, 'confirmed')],
    }))

    it('REFUSES an out-of-range cursor instead of redirecting onto carried work', () => {
      expect(resolveWriteIndex(scaffoldOf(carried, 3), { blockWhenOutOfRange: true })).toBeNull()
      expect(error).toHaveBeenCalledWith(expect.stringContaining('[continuation-guard]'))
      // and it is LOUD, not a silent no-op
      expect(error).toHaveBeenCalledWith(expect.stringContaining('REFUSING'))
    })

    it('refuses every out-of-range cursor, not just the exact sentinel', () => {
      for (const cursor of [3, 99, -1]) {
        expect(resolveWriteIndex(scaffoldOf(carried, cursor), { blockWhenOutOfRange: true })).toBeNull()
      }
    })

    it('still passes an IN-range cursor through — an unfinished section is safe to write', () => {
      expect(resolveWriteIndex(scaffoldOf(carried, 1), { blockWhenOutOfRange: true })).toBe(1)
      expect(error).not.toHaveBeenCalled()
    })

    it('leaves NORMAL sessions on the redirect path (flag off = old behaviour, exactly)', () => {
      expect(resolveWriteIndex(scaffoldOf(carried, 3))).toBe(2)
      expect(resolveWriteIndex(scaffoldOf(carried, 3), { blockWhenOutOfRange: false })).toBe(2)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('[token-safety-net]'))
    })
  })
})

// ── The 2026-08-08 "Keep working on this" loss, at the paragraph level ────────────────
// Reproduced live before the fix: a v2 carrying 3 finished paragraphs inherits cursor 3,
// two dictations both compute position 3, /api/paragraphs upserts on (session_id,
// position), and the second returns THE SAME ROW ID as the first — the first addition is
// gone, with no throw and no log.
describe('resolveParagraphWriteIndex', () => {
  const carriedParas = [0, 1, 2].map(i => ({ position: i, paragraph_index: i, scribed_text: `carried v1 paragraph ${i}` }))
  const scaffold3 = { current_paragraph_index: 3, components: [{}, {}, {}] }

  it('NORMAL session: unchanged: cursor wins, out-of-range and all', () => {
    expect(resolveParagraphWriteIndex({ scaffold: scaffold3, paragraphs: carriedParas })).toBe(3)
    expect(resolveParagraphWriteIndex({ scaffold: { current_paragraph_index: 1, components: [{}, {}, {}] }, paragraphs: carriedParas })).toBe(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('NORMAL session with no scaffold: appends at the end, as before', () => {
    expect(resolveParagraphWriteIndex({ scaffold: null, paragraphs: carriedParas })).toBe(3)
    expect(resolveParagraphWriteIndex({ scaffold: null, paragraphs: [] })).toBe(0)
  })

  it('CONTINUATION: refuses the inherited out-of-range cursor (the reproduced loss)', () => {
    expect(resolveParagraphWriteIndex({ scaffold: scaffold3, paragraphs: carriedParas, isContinuation: true })).toBeNull()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('REFUSING'))
  })

  it('CONTINUATION: two successive saves can never resolve to the same position', () => {
    // The precise shape of the bug: call it twice with the state a second dictation sees.
    const a = resolveParagraphWriteIndex({ scaffold: scaffold3, paragraphs: carriedParas, isContinuation: true })
    const b = resolveParagraphWriteIndex({ scaffold: scaffold3, paragraphs: carriedParas, isContinuation: true })
    expect(a).toBeNull()
    expect(b).toBeNull()   // before the fix both were 3, and the 2nd upsert ate the 1st
  })

  it('CONTINUATION: refuses an IN-range position that already holds carried writing', () => {
    const sc = { current_paragraph_index: 1, components: [{}, {}, {}] }
    expect(resolveParagraphWriteIndex({ scaffold: sc, paragraphs: carriedParas, isContinuation: true })).toBeNull()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('already holds carried writing'))
  })

  it('CONTINUATION: ALLOWS filling a section v1 left empty — the one safe write', () => {
    const gapped = [{ position: 0, paragraph_index: 0, scribed_text: 'carried' },
                    { position: 2, paragraph_index: 2, scribed_text: 'carried' }]
    const sc = { current_paragraph_index: 1, components: [{}, {}, {}] }
    expect(resolveParagraphWriteIndex({ scaffold: sc, paragraphs: gapped, isContinuation: true })).toBe(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('CONTINUATION: a blank/whitespace carried row counts as empty, not as writing', () => {
    const blank = [{ position: 1, paragraph_index: 1, scribed_text: '   ' }]
    const sc = { current_paragraph_index: 1, components: [{}, {}, {}] }
    expect(resolveParagraphWriteIndex({ scaffold: sc, paragraphs: blank, isContinuation: true })).toBe(1)
  })

  it('CONTINUATION with no scaffold: appends (positions differ, so nothing can collide)', () => {
    expect(resolveParagraphWriteIndex({ scaffold: null, paragraphs: carriedParas, isContinuation: true })).toBe(3)
  })

  it('degenerate input never throws', () => {
    expect(() => resolveParagraphWriteIndex()).not.toThrow()
    expect(resolveParagraphWriteIndex()).toBe(0)
  })
})

describe('updateComponentItem', () => {
  it('writes to a valid target', () => {
    const sc = scaffoldOf(personalStatement(), 0)
    const out = updateComponentItem(sc, 0, 'reflection', it => ({ ...it, status: 'confirmed', text: 'I learned something.' }))
    expect(out.components[0].items[2].text).toBe('I learned something.')
    expect(error).not.toHaveBeenCalled()
  })

  // Before the fix this returned the scaffold silently unchanged — no throw, no log —
  // while the client had already shown the text to the student.
  it('SCREAMS instead of silently dropping an out-of-range write', () => {
    const sc = scaffoldOf(personalStatement(), 1)
    const out = updateComponentItem(sc, 1, 'reflection', it => ({ ...it, text: 'lost forever' }))
    expect(out).toEqual(sc)  // still a no-op…
    expect(error).toHaveBeenCalledWith(expect.stringContaining('DROPPED WRITE'))  // …but never silent
  })

  it('SCREAMS on an unknown component id', () => {
    const sc = scaffoldOf(personalStatement(), 0)
    updateComponentItem(sc, 0, 'no_such_component', it => it)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no component "no_such_component"'))
  })

  it('end to end: the exact lost write now lands', () => {
    // Reconstructs the moment Baron's reflection was coached. Cursor is at 1 (past the
    // only section). Routing through resolveWriteIndex is what saves the sentence.
    const sc = scaffoldOf(personalStatement(), 1)
    const paraIdx = resolveWriteIndex(sc)
    const out = updateComponentItem(sc, paraIdx, 'reflection', it => ({
      ...it, status: 'confirmed', text: 'I learned that I write better when things are broken into smaller parts.',
    }))
    expect(out.components[0].items[2].status).toBe('confirmed')
    expect(out.components[0].items[2].text).toMatch(/broken into smaller parts/)
    expect(error).not.toHaveBeenCalled()
  })
})

// ── The SECOND silent-drop path (Elio, 2026-06-26 · found 2026-07-28) ────────────────
describe('resolveDoneText', () => {
  const item = (over = {}) => ({ id: 'body', status: 'locked', text: null, nuggetText: null, ...over })

  it('prefers inline text from [DONE:id:the exact words]', () => {
    const r = resolveDoneText(item({ nuggetText: 'stale' }), 'the exact words')
    expect(r).toEqual({ text: 'the exact words', source: 'inline', dropped: false })
  })

  it('falls back to a captured NUGGET when DONE carries no text', () => {
    const r = resolveDoneText(item({ nuggetText: 'from the nugget' }), '')
    expect(r.text).toBe('from the nugget')
    expect(r.dropped).toBe(false)
  })

  it('falls back to text the component already holds', () => {
    expect(resolveDoneText(item({ text: 'already saved' }), '').source).toBe('existing')
  })

  it('reports dropped=true when there is genuinely nothing to save', () => {
    // The exact Elio shape: prose built over several turns, no [NUGGET:] ever emitted,
    // then a bare [DONE:body]. The old code returned the item untouched and said nothing.
    const r = resolveDoneText(item(), '')
    expect(r).toEqual({ text: '', source: 'none', dropped: true })
  })

  it('treats whitespace-only inline text as nothing, not as content', () => {
    expect(resolveDoneText(item(), '   \n  ').dropped).toBe(true)
  })

  it('never invents text — a dropped resolve returns empty, not the last thing it saw', () => {
    // Deliberate: the last student turn at this point is almost always "Yes" (approving
    // an edit). Writing that in would be worse than leaving the hole.
    expect(resolveDoneText(item(), '').text).toBe('')
  })
})

// ── The THIRD silent-drop path (Baron's Gratitude Letter, 2026-08-04) ────────────────
// A custom scaffold names its items by position (c0, c1…). The coach emitted [DONE:hook],
// [DONE:context] and [DONE:closing] — none of which exist there — so every lock-in was
// discarded and 151 of 182 words never reached the Final Draft. He reported it himself.
describe('resolveComponentTarget', () => {
  const custom = (over = {}) => ({
    index: 0, type: 'custom', status: 'working',
    items: [{ id: 'c0', label: 'Letter', status: 'candidate', text: null, nuggetText: 'Dear Dad…', ...over }],
  })
  const prose = () => ({
    index: 0, type: 'narrative', status: 'working',
    items: [
      { id: 'hook', status: 'confirmed', text: 'A hook.', nuggetText: null },
      { id: 'body', status: 'working', text: null, nuggetText: null },
    ],
  })

  it('returns the exact component when the coach names a real one', () => {
    expect(resolveComponentTarget(prose(), 'body')).toEqual({ id: 'body', exact: true })
  })

  it('matches ids case-insensitively', () => {
    expect(resolveComponentTarget(prose(), 'BODY')).toEqual({ id: 'body', exact: true })
  })

  it('REDIRECTS a prose name onto a custom scaffold instead of dropping it', () => {
    // The exact Gratitude Letter shape.
    expect(resolveComponentTarget(custom(), 'hook')).toEqual({ id: 'c0', exact: false })
    expect(resolveComponentTarget(custom(), 'closing')).toEqual({ id: 'c0', exact: false })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('applying to "c0"'))
  })

  it('prefers the first UNCONFIRMED item — where the work actually is', () => {
    expect(resolveComponentTarget(prose(), 'no_such_thing')).toEqual({ id: 'body', exact: false })
  })

  it('falls back to the last item when everything is already confirmed', () => {
    const done = { items: [
      { id: 'a', status: 'confirmed', text: 'x' }, { id: 'b', status: 'confirmed', text: 'y' },
    ] }
    expect(resolveComponentTarget(done, 'zzz')).toEqual({ id: 'b', exact: false })
  })

  it('returns null for an empty or missing section rather than guessing', () => {
    expect(resolveComponentTarget({ items: [] }, 'hook')).toBeNull()
    expect(resolveComponentTarget(null, 'hook')).toBeNull()
  })

  it('end to end: the letter is confirmed instead of discarded', () => {
    // With the redirect, [DONE:hook] against a c0-only scaffold confirms the student's
    // 151 words rather than matching nothing. The assembly only takes `confirmed` items,
    // which is why the old no-op cost him the whole letter.
    const sc = { components: [custom()], current_paragraph_index: 0 }
    const t = resolveComponentTarget(sc.components[0], 'hook')
    const out = updateComponentItem(sc, 0, t.id, item => ({
      ...item, status: 'confirmed', text: item.text || item.nuggetText,
    }))
    expect(out.components[0].items[0].status).toBe('confirmed')
    expect(out.components[0].items[0].text).toBe('Dear Dad…')
    expect(error).not.toHaveBeenCalled()
  })
})

// ── Cross-section resolution (red-team finding, 2026-08-04) ─────────────────────────
// resolveComponentTarget only searched the section under the cursor. But the coach is
// explicitly instructed to revisit the thesis while working on later paragraphs, so
// [DONE:thesis:new wording] from a body paragraph looked like an UNKNOWN id — and the
// inexact fallback either discarded the revision or wrote the thesis into the body's
// evidence slot. The Final Draft kept the old wording either way, and the orphan check
// couldn't see it (the old thesis's words are all still present).
describe('resolveComponentWrite', () => {
  const essay = () => ({
    current_paragraph_index: 1,
    components: [
      { index: 0, type: 'introduction', items: [
        { id: 'hook', status: 'confirmed', text: 'A hook.' },
        { id: 'thesis', status: 'confirmed', text: 'The old thesis.' },
      ] },
      { index: 1, type: 'body', items: [
        { id: 'topic_sentence', status: 'confirmed', text: 'A topic sentence.' },
        { id: 'evidence', status: 'working', text: null, nuggetText: null },
      ] },
    ],
  })

  it('resolves an id in the CURRENT section exactly', () => {
    expect(resolveComponentWrite(essay(), 1, 'evidence'))
      .toEqual({ paraIdx: 1, id: 'evidence', exact: true, crossSection: false })
  })

  // MY OWN FIX WAS WRONG FIRST TIME: I assumed component ids are unique across a prose
  // template. getParaItems gives EVERY body paragraph the same four ids, so "search all
  // sections, take the first hit" sent a revision meant for body 3 into body 1 — over the
  // top of a CONFIRMED component, on the exact-match path that skips the no-overwrite
  // guard. The fix introduced a new way to lose writing.
  it('REFUSES to cross sections when the id is ambiguous', () => {
    const essayWithBodies = { current_paragraph_index: 3, components: [
      { items: [{ id: 'hook', status: 'confirmed', text: 'A hook.' }] },
      { items: [{ id: 'evidence', status: 'confirmed', text: "BODY ONE's finished evidence." }] },
      { items: [{ id: 'evidence', status: 'confirmed', text: "BODY TWO's finished evidence." }] },
      { items: [{ id: 'echo', status: 'working', text: null }] },
    ] }
    const r = resolveComponentWrite(essayWithBodies, 3, 'evidence')
    // Must stay local (inexact, guarded) rather than overwrite body one.
    expect(r.paraIdx).toBe(3)
    expect(r.exact).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('appears in 2 sections'))
  })

  it('REFUSES a cross-section write into an already-assembled paragraph', () => {
    // Its prose row is what the Final Draft renders, so a scaffold-only write would show
    // the student a revision the deliverable never receives — the same checklist/prose
    // divergence we removed the manual Revise button to prevent.
    const r = resolveComponentWrite(essay(), 1, 'thesis', { assembledIndexes: [0] })
    expect(r).toBeNull()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('REFUSED cross-section write'))
  })

  it('follows a real id into ANOTHER section instead of misfiling it', () => {
    // THE BUG: from body paragraph 1, [DONE:thesis:…] must reach the introduction.
    expect(resolveComponentWrite(essay(), 1, 'thesis'))
      .toEqual({ paraIdx: 0, id: 'thesis', exact: true, crossSection: true })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('belongs to paragraph 0'))
  })

  it('does NOT write a revision into the current section\'s empty slot', () => {
    // The old behaviour polluted `evidence` with the thesis text.
    const r = resolveComponentWrite(essay(), 1, 'thesis')
    expect(r.id).not.toBe('evidence')
  })

  it('still falls back inexactly when the id exists nowhere', () => {
    const r = resolveComponentWrite(essay(), 1, 'no_such_component')
    expect(r).toEqual({ paraIdx: 1, id: 'evidence', exact: false, crossSection: false })
  })

  it('prefers the CURRENT section when the same id exists in both', () => {
    // Body paragraphs share ids (topic_sentence appears in every body section) — a write
    // must land where the student is working, not in the first match.
    const multi = { current_paragraph_index: 2, components: [
      { items: [{ id: 'topic_sentence', status: 'confirmed', text: 'first' }] },
      { items: [{ id: 'topic_sentence', status: 'confirmed', text: 'second' }] },
      { items: [{ id: 'topic_sentence', status: 'working', text: null }] },
    ] }
    expect(resolveComponentWrite(multi, 2, 'topic_sentence').paraIdx).toBe(2)
  })

  it('returns null for an empty scaffold rather than guessing', () => {
    expect(resolveComponentWrite({ components: [] }, 0, 'hook')).toBeNull()
    expect(resolveComponentWrite(null, 0, 'hook')).toBeNull()
  })
})

describe('shouldPreserveExisting — an inferred target must not overwrite words', () => {
  const withText = { id: 'hook', status: 'confirmed', text: 'THE STUDENT\'S FINISHED HOOK' }
  const withNugget = { id: 'hook', status: 'candidate', text: null, nuggetText: 'CAPTURED WORDS' }
  const empty = { id: 'hook', status: 'locked', text: null, nuggetText: null }

  // THE BUG (found by coach-ai, verified at both ends 2026-08-17): resolveComponentWrite
  // returns exact:true for a CROSS-SECTION hit, and the DONE handler gated on `exact`
  // alone — so a redirect into another section skipped the no-overwrite guard and
  // replaced confirmed text. A body paragraph emitting [DONE:hook:…] uniquely matches
  // the intro's hook and would overwrite a finished paragraph with body content.
  it('PRESERVES on a cross-section redirect onto existing text (the regression)', () => {
    expect(shouldPreserveExisting({ exact: true, crossSection: true }, withText)).toBe(true)
    expect(shouldPreserveExisting({ exact: true, crossSection: true }, withNugget)).toBe(true)
  })

  it('PRESERVES on an inexact local match onto existing text (unchanged behaviour)', () => {
    expect(shouldPreserveExisting({ exact: false, crossSection: false }, withText)).toBe(true)
  })

  // The redirect still does its job where nothing can be lost — this is the case
  // Baron's 151 dropped words argued for, and it must not regress into a refusal.
  it('ALLOWS any inferred write into an EMPTY component (no loss possible)', () => {
    expect(shouldPreserveExisting({ exact: true, crossSection: true }, empty)).toBe(false)
    expect(shouldPreserveExisting({ exact: false, crossSection: false }, empty)).toBe(false)
  })

  it('ALLOWS a genuine LOCAL exact revision to overwrite (revisions are the point)', () => {
    expect(shouldPreserveExisting({ exact: true, crossSection: false }, withText)).toBe(false)
  })

  it('tolerates a missing target/item without throwing', () => {
    expect(shouldPreserveExisting(null, withText)).toBe(true)      // no target = inferred at best
    expect(shouldPreserveExisting({ exact: true }, null)).toBe(false)
    expect(shouldPreserveExisting(undefined, undefined)).toBe(false)
  })
})

describe('preserveExistingItem — bank the words, record the refusal', () => {
  it('BANKS a candidate\'s captured words as confirmed (never leaves them to be dropped)', () => {
    const candidate = { id: 'hook', status: 'candidate', text: null, nuggetText: 'THE STUDENT\'S CAPTURED HOOK' }
    const out = preserveExistingItem(candidate, { exact: true, crossSection: true })
    // Assembly takes confirmed items ONLY — leaving this a candidate is how words go
    // missing from a Final Draft (Baron's shape).
    expect(out.status).toBe('confirmed')
    expect(out.text).toBe('THE STUDENT\'S CAPTURED HOOK')
  })

  it('keeps already-confirmed text exactly as it was', () => {
    const confirmed = { id: 'hook', status: 'confirmed', text: 'FINISHED HOOK', nuggetText: null }
    const out = preserveExistingItem(confirmed, { exact: false })
    expect(out.text).toBe('FINISHED HOOK')
    expect(out.status).toBe('confirmed')
  })

  it('STAMPS the refusal so it is a recorded fact, not just a console line', () => {
    const item = { id: 'thesis', status: 'confirmed', text: 'OLD THESIS' }
    expect(preserveExistingItem(item, { exact: true, crossSection: true }).revisionRefused).toBe('cross-section')
    expect(preserveExistingItem(item, { exact: false, crossSection: false }).revisionRefused).toBe('inexact')
  })

  it('does not mutate the input item', () => {
    const item = { id: 'hook', status: 'candidate', nuggetText: 'WORDS' }
    const snapshot = JSON.stringify(item)
    preserveExistingItem(item, { exact: false })
    expect(JSON.stringify(item)).toBe(snapshot)
  })

  it('never reports a drop — the words were kept, not lost', () => {
    const item = { id: 'hook', status: 'candidate', nuggetText: 'WORDS' }
    expect(preserveExistingItem(item, { exact: false }).writeDropped).toBe(false)
  })
})

// ── A grown story: narrative section 0 + custom scenes (red-team, 2026-08-17) ───────
// Narrative growth appends CUSTOM sections, so a scaffold now holds BOTH id spaces at
// once: hook/context/body/closing in section 0, positional c0/c1… in the scenes. Those
// spaces are disjoint, which turned every prose name the coach emits on a scene into an
// "unambiguous" cross-section hit into section 0 — where the no-overwrite guard then
// (correctly) refused it. Three individually-correct guards; the scene's words landed
// NOWHERE. This is the composition case CLAUDE.md's "does this net weaken another net"
// rule is about, and it is the exact shape no existing fixture built.
describe('resolveComponentWrite — mixed narrative + grown custom scenes', () => {
  const story = (sceneText = null) => ({
    current_paragraph_index: 1,
    components: [
      { index: 0, type: 'narrative', items: [
        { id: 'hook', status: 'confirmed', text: 'HER OPENING' },
        { id: 'context', status: 'confirmed', text: 'HER SETUP' },
        { id: 'body', status: 'confirmed', text: 'HER MIDDLE' },
        { id: 'closing', status: 'confirmed', text: 'HER 152-WORD ENDING' },
      ] },
      { index: 1, type: 'custom', items: [
        { id: 'c0', label: 'Scene 2', status: sceneText ? 'confirmed' : 'locked', text: sceneText, nuggetText: null },
      ] },
    ],
  })

  it('a prose name on a scene resolves to the SCENE, not back into section 0', () => {
    for (const id of ['closing', 'body', 'hook', 'context']) {
      const t = resolveComponentWrite(story(), 1, id)
      expect(t).toEqual({ paraIdx: 1, id: 'c0', exact: false, crossSection: false })
    }
  })

  it("so the scene's words actually land — the write is not refused", () => {
    const t = resolveComponentWrite(story(), 1, 'closing')
    const item = story().components[1].items[0]
    expect(shouldPreserveExisting(t, item)).toBe(false)
  })

  it('holds even when section 0 is already assembled (where it returned null before)', () => {
    const t = resolveComponentWrite(story(), 1, 'closing', { assembledIndexes: [0] })
    expect(t).toEqual({ paraIdx: 1, id: 'c0', exact: false, crossSection: false })
  })

  it('and it still refuses to overwrite a scene that already has words', () => {
    const t = resolveComponentWrite(story('SCENE TWO, 280 WORDS'), 1, 'closing')
    const item = story('SCENE TWO, 280 WORDS').components[1].items[0]
    expect(t.exact).toBe(false)
    expect(shouldPreserveExisting(t, item)).toBe(true)
    expect(preserveExistingItem(item, t).text).toBe('SCENE TWO, 280 WORDS')
  })

  // The narrowing that keeps a real cross-scene revision working: a POSITIONAL id can
  // genuinely name another scene, so it keeps the cross-section path.
  it('a positional id aimed at an earlier scene still crosses sections', () => {
    const threeScenes = {
      current_paragraph_index: 2,
      components: [
        story().components[0],
        { index: 1, type: 'custom', items: [{ id: 'c0', status: 'confirmed', text: 'SCENE TWO' }] },
        { index: 2, type: 'custom', items: [{ id: 'c1', status: 'locked', text: null }] },
      ],
    }
    expect(resolveComponentWrite(threeScenes, 2, 'c0')).toEqual({
      paraIdx: 1, id: 'c0', exact: true, crossSection: true,
    })
  })

  // The rule is scoped to CUSTOM sections, so the thesis revisit from a body paragraph —
  // the reason cross-section resolution exists at all — is untouched.
  it('does NOT apply to a prose section: a thesis revisit still crosses', () => {
    const essayish = {
      current_paragraph_index: 1,
      components: [
        { index: 0, type: 'introduction', items: [{ id: 'thesis', status: 'confirmed', text: 'OLD' }] },
        { index: 1, type: 'body', items: [{ id: 'topic_sentence', status: 'locked', text: null }] },
      ],
    }
    expect(resolveComponentWrite(essayish, 1, 'thesis')).toEqual({
      paraIdx: 0, id: 'thesis', exact: true, crossSection: true,
    })
  })
})

// ── The order-independence guard for lock-by-reference ────────────────────────────────
// The two lanes are meant to land together. This is what stops a partial deploy from
// destroying writing if they don't: verified against this exact function BEFORE the guard,
// an unresolved anchor came back as {text: '<the anchor string>', dropped: false} — the
// student's passage replaced by the quotation marks around it, reported as success.
describe('resolveDoneText — an UNRESOLVED anchored payload is refused', () => {
  const ANCHORED = '"One and Two hopped tentatively"…"gnawing off big chunks of nut."'

  it('refuses rather than saving the anchor string as the text', () => {
    expect(resolveDoneText({ id: 'body' }, ANCHORED))
      .toEqual({ text: '', source: 'none', dropped: true })
  })

  it('never overwrites text the student already has', () => {
    const r = resolveDoneText({ id: 'body', text: 'THE STUDENT\'S REAL 900 WORDS' }, ANCHORED)
    expect(r.dropped).toBe(true)
    expect(r.text).toBe('')
  })

  it('accepts the curly-quote and three-dot variants a real model emits', () => {
    for (const p of [
      '“first few words”…“last few words”',
      "'first few words'...'last few words'",
      '"first few words" … "last few words"',
    ]) {
      expect(resolveDoneText({ id: 'body' }, p).dropped).toBe(true)
    }
  })

  it('leaves the ordinary inline echo completely untouched', () => {
    // The legacy form must keep working forever — old sessions carry it (spec, Rollout 5).
    expect(resolveDoneText({ id: 'hook' }, 'Their actual sentence.'))
      .toEqual({ text: 'Their actual sentence.', source: 'inline', dropped: false })
  })

  it('does not mistake ordinary prose containing an ellipsis for an anchor', () => {
    // A student's own writing may contain "…" between quoted speech. Only the strict
    // quote-…-quote WHOLE-payload shape counts.
    const prose = 'She said "wait" … and then he was gone, and that was the end of it.'
    expect(resolveDoneText({ id: 'body' }, prose).dropped).toBe(false)
  })

  it('still falls back to a captured candidate on a BARE lock', () => {
    // Mechanism 1 rides this existing path — bare [DONE:id] is already supported.
    expect(resolveDoneText({ id: 'hook', nuggetText: 'their dictated line' }, ''))
      .toEqual({ text: 'their dictated line', source: 'nugget', dropped: false })
  })
})
