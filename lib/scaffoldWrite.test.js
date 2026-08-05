// Regression test for the 2026-07-20 silent data loss.
//
// The functions under test are the ones TutorSession.js calls on every scaffold write.
// They live in lib/ precisely so they can be tested without React or a DOM — the same
// "PURE brain" split as lib/provenance.js and lib/requirements.js.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveWriteIndex, updateComponentItem, resolveDoneText, resolveComponentTarget, resolveComponentWrite } from './scaffoldWrite'

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
