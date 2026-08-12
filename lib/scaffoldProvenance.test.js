import { describe, it, expect } from 'vitest'
import {
  annotateScaffoldProvenance,
  needsProvenancePass,
  sessionCoachContribution,
} from './scaffoldProvenance.js'

// Lever B Phase 1 is a SHADOW monitor, and the failure that actually happened was not a
// wrong score — it was no score at all, reported as success. Measured 2026-08-11: 14
// completed paragraphs carried zero provenance records while item locks in the SAME
// scaffolds carried 19. These tests hold the shape of that bug, plus the false-positive
// shape that would matter the moment Phase 2 starts refusing locks.

const SPOKEN = ['recess helps kids focus better after they move around and play outside']

const para = (over = {}) => ({
  index: 0,
  status: 'active',
  items: [{ id: 'hook', status: 'draft', text: '' }],
  ...over,
})

describe('needsProvenancePass', () => {
  it('is true for a completed paragraph that has never been scored', () => {
    expect(needsProvenancePass([para({ status: 'complete' })], [])).toBe(true)
  })

  // THE REGRESSION. The old predicate asked "did this just transition to complete?",
  // so a completion whose text was not readable on that one PATCH was never revisited:
  // the edge was spent, `!provenance` guarded the retry out, and nothing logged it.
  it('stays true on a LATER patch when the completion was never scored', () => {
    const stored = [para({ status: 'complete' })]   // already complete, still no record
    const incoming = [para({ status: 'complete' })]
    expect(needsProvenancePass(incoming, stored)).toBe(true)
  })

  it('is false once every lock carries a record — no pointless source fetch', () => {
    const scored = para({
      status: 'complete',
      provenance: { pass: true, novelFraction: 0, contentCount: 5 },
      items: [{ id: 'hook', status: 'confirmed', text: 'kids focus', provenance: { pass: true, novelFraction: 0, contentCount: 2 } }],
    })
    expect(needsProvenancePass([scored], [scored])).toBe(false)
  })

  it('sees a record the client dropped but the stored copy still has', () => {
    // The client PATCHes the whole tree without server-added keys (the STICKY case).
    const stored = [para({ status: 'complete', provenance: { pass: true, novelFraction: 0, contentCount: 5 } })]
    expect(needsProvenancePass([para({ status: 'complete' })], stored)).toBe(false)
  })
})

describe('annotateScaffoldProvenance', () => {
  it('scores a completed paragraph — the arm that had never fired', () => {
    const { components, checked } = annotateScaffoldProvenance({
      incoming: [para({ status: 'complete' })],
      stored: [],
      paragraphTexts: { 0: 'recess helps kids focus better' },
      studentSources: SPOKEN,
    })
    expect(checked).toHaveLength(1)
    expect(checked[0].kind).toBe('paragraph')
    expect(components[0].provenance.pass).toBe(true)
  })

  it('scores a paragraph that went complete on an EARLIER patch', () => {
    const stored = [para({ status: 'complete' })]        // completed, unscored
    const { checked } = annotateScaffoldProvenance({
      incoming: [para({ status: 'complete' })],
      stored,
      paragraphTexts: { 0: 'recess helps kids focus better' },
      studentSources: SPOKEN,
    })
    expect(checked).toHaveLength(1)
  })

  it('reports an unscorable lock instead of passing it silently', () => {
    const { checked, unscorable, components } = annotateScaffoldProvenance({
      incoming: [para({ status: 'complete' })],
      stored: [],
      paragraphTexts: {},                                 // the scribed row is not readable yet
      studentSources: SPOKEN,
    })
    expect(checked).toHaveLength(0)
    expect(unscorable).toEqual([{ kind: 'paragraph', paraIndex: 0, reason: 'no scribed text' }])
    // Left unscored ON PURPOSE, so the next PATCH retries it.
    expect(components[0].provenance).toBeUndefined()
  })

  // With no baseline every content word is novel by construction, so everything scores
  // 1.0 — under Phase 2 that refuses a lock the student genuinely earned. The route has
  // a call path that passes empty sources; it must never be able to accuse anyone.
  it('refuses to score at all when there is no student baseline', () => {
    const { checked, flagged, unscorable } = annotateScaffoldProvenance({
      incoming: [para({ status: 'complete' })],
      stored: [],
      paragraphTexts: { 0: 'recess helps kids focus better' },
      studentSources: [],
    })
    expect(checked).toHaveLength(0)
    expect(flagged).toHaveLength(0)
    expect(unscorable[0].reason).toBe('no student baseline')
  })

  it('flags coach vocabulary the student never said', () => {
    const { flagged } = annotateScaffoldProvenance({
      incoming: [para({ status: 'complete' })],
      stored: [],
      paragraphTexts: { 0: 'Prolonged sedentary intervals demonstrably impair adolescent cognition' },
      studentSources: SPOKEN,
    })
    expect(flagged).toHaveLength(1)
    expect(flagged[0].provenance.pass).toBe(false)
  })

  it('never re-scores or overwrites an existing record', () => {
    const existing = { pass: false, novelFraction: 0.9, contentCount: 6, mode: 'shadow', v: 1 }
    const { components, checked } = annotateScaffoldProvenance({
      incoming: [para({ status: 'complete' })],
      stored: [para({ status: 'complete', provenance: existing })],
      paragraphTexts: { 0: 'recess helps kids focus better' },
      studentSources: SPOKEN,
    })
    expect(components[0].provenance).toEqual(existing)
    expect(checked).toHaveLength(0)
  })

  it('never drops or downgrades a lock — shadow mode only ever ADDS a key', () => {
    const incoming = [para({
      status: 'complete',
      items: [{ id: 'hook', status: 'confirmed', text: 'quantum epistemology' }],
    })]
    const { components } = annotateScaffoldProvenance({
      incoming, stored: [], paragraphTexts: { 0: 'quantum epistemology' }, studentSources: SPOKEN,
    })
    expect(components[0].status).toBe('complete')
    expect(components[0].items[0].status).toBe('confirmed')
    expect(components[0].items[0].text).toBe('quantum epistemology')
  })
})

describe('sessionCoachContribution', () => {
  it('weights by content count, and a paragraph record supersedes its items', () => {
    const components = [{
      provenance: { pass: true, novelFraction: 0, contentCount: 40 },
      items: [{ provenance: { pass: false, novelFraction: 1, contentCount: 3 } }],
    }]
    // Counting the items too would double-count the same words.
    expect(sessionCoachContribution(components)).toEqual({
      checkedCount: 1, flaggedCount: 0, coachContribRatio: 0,
    })
  })

  it('is 0, not NaN, on a session with nothing scored', () => {
    expect(sessionCoachContribution([]).coachContribRatio).toBe(0)
  })
})
