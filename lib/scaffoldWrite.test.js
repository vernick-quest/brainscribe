// Regression test for the 2026-07-20 silent data loss.
//
// The functions under test are the ones TutorSession.js calls on every scaffold write.
// They live in lib/ precisely so they can be tested without React or a DOM — the same
// "PURE brain" split as lib/provenance.js and lib/requirements.js.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveWriteIndex, updateComponentItem } from './scaffoldWrite'

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
