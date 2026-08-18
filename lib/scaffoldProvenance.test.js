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

  // Found by adversarial review, confirmed by probe: the client PATCHes the whole tree
  // and RLS lets a student write their own scaffold, so an incoming `provenance` key is
  // attacker-controlled. Honouring it marks a lock pre-scored and exempt forever — under
  // Phase 2 that is the entire enforcement bypassed from devtools.
  it('DISCARDS a client-supplied provenance record and scores anyway', () => {
    const forged = { pass: true, novelFraction: 0, contentCount: 99, mode: 'shadow', v: 1 }
    const incoming = [para({
      status: 'complete',
      provenance: forged,
      items: [{ id: 'hook', status: 'confirmed', text: 'Prolonged sedentary intervals impair cognition', provenance: forged }],
    })]
    expect(needsProvenancePass(incoming, [])).toBe(true)

    const { components, checked, flagged } = annotateScaffoldProvenance({
      incoming,
      stored: [],
      paragraphTexts: { 0: 'Prolonged sedentary intervals demonstrably impair adolescent cognition' },
      studentSources: SPOKEN,
    })
    expect(checked).toHaveLength(2)
    expect(flagged.length).toBeGreaterThan(0)
    expect(components[0].provenance).not.toEqual(forged)
    expect(components[0].provenance.pass).toBe(false)
    expect(components[0].items[0].provenance.pass).toBe(false)
  })

  it('drops a forged record entirely when the server has none to put back', () => {
    const forged = { pass: true, novelFraction: 0, contentCount: 99 }
    const { components } = annotateScaffoldProvenance({
      incoming: [para({ status: 'active', items: [{ id: 'hook', status: 'draft', text: '', provenance: forged }] })],
      stored: [],
      paragraphTexts: {},
      studentSources: SPOKEN,
    })
    expect(components[0].items[0].provenance).toBeUndefined()
  })

  // hasBaseline used to measure string length, but scoring measures CONTENT TOKENS —
  // and "ok yes please" leaves the single token "please", non-empty yet useless. That
  // satisfied the first version of this guard and scored the lock 1.0 anyway, which is
  // the exact false positive the guard exists to stop.
  it('treats a too-thin baseline as no baseline', () => {
    const { checked, unscorable } = annotateScaffoldProvenance({
      incoming: [para({ status: 'complete' })],
      stored: [],
      paragraphTexts: { 0: 'My dog Biscuit rescued a baby bird' },
      studentSources: ['ok yes please', 'um', 'yeah sure'],
    })
    expect(checked).toHaveLength(0)
    expect(unscorable[0].reason).toBe('no student baseline')
  })

  it('scores normally once the student has actually said something', () => {
    const { checked } = annotateScaffoldProvenance({
      incoming: [para({ status: 'complete' })],
      stored: [],
      paragraphTexts: { 0: 'recess helps kids focus' },
      studentSources: SPOKEN,   // ~9 content words + the sentence below
    })
    expect(checked).toHaveLength(1)
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
    // Counting the items too would double-count the same words. toMatchObject, not
    // toEqual: the assertion is about the paragraph record superseding its items, and an
    // exact-shape match made an ADDITIVE field (referencedCount) read as a regression.
    expect(sessionCoachContribution(components)).toMatchObject({
      checkedCount: 1, flaggedCount: 0, coachContribRatio: 0,
    })
  })

  it('is 0, not NaN, on a session with nothing scored', () => {
    expect(sessionCoachContribution([]).coachContribRatio).toBe(0)
  })
})

// ── Referenced locks (SPEC-lock-by-reference.md) ──────────────────────────────────────
// A lock resolved by reference pulled its text out of the student's own message, so its
// novelFraction is 0 BY CONSTRUCTION. Counting it would drag the ratio down weighted by
// passage length — the reassuring direction, and the direction every loss in this repo has
// taken.
describe('sessionCoachContribution — referenced locks are excluded, not silently dropped', () => {
  const rec = (novelFraction, contentCount, referenced = false) =>
    ({ novelFraction, contentCount, pass: true, referenced })

  it('a long referenced lock does not dilute the ratio', () => {
    const mixed = [{ items: [
      { provenance: rec(0.50, 20) },         // echoed: half the content words are the coach's
      { provenance: rec(0.00, 400, true) },  // referenced: 400 words, 0 novel by construction
    ] }]
    const r = sessionCoachContribution(mixed)
    expect(r.coachContribRatio).toBe(0.5)   // the echoed lock's real value, undiluted
    expect(r.referencedCount).toBe(1)
    expect(r.scoredCount).toBe(1)
    expect(r.checkedCount).toBe(2)
  })

  it('shows what the old behaviour would have produced — 0.024 instead of 0.5', () => {
    // Same two locks with the flag absent: 10 novel words over 420 total. A session whose
    // scored lock is half coach-authored reads as 2% coach. That is the miscalibration.
    const naive = [{ items: [{ provenance: rec(0.50, 20) }, { provenance: rec(0.00, 400) }] }]
    expect(sessionCoachContribution(naive).coachContribRatio).toBeCloseTo(0.024, 3)
  })

  it('reports referencedCount so a MIXED corpus is visible to whoever calibrates', () => {
    const r = sessionCoachContribution([{ items: [
      { provenance: rec(0.4, 10) }, { provenance: rec(0, 50, true) }, { provenance: rec(0, 50, true) },
    ] }])
    expect(r).toMatchObject({ checkedCount: 3, referencedCount: 2, scoredCount: 1 })
  })

  it('an all-referenced session scores 0 with scoredCount 0 — "nothing measured", not "clean"', () => {
    const r = sessionCoachContribution([{ items: [{ provenance: rec(0, 300, true) }] }])
    expect(r.scoredCount).toBe(0)
    expect(r.coachContribRatio).toBe(0)
  })

  it('still counts a referenced lock that FAILED its check', () => {
    // Excluded from the RATIO, never from the flag count — a referenced lock can still
    // fail for reasons unrelated to novelty.
    const r = sessionCoachContribution([{ items: [
      { provenance: { novelFraction: 0, contentCount: 100, pass: false, referenced: true } },
    ] }])
    expect(r.flaggedCount).toBe(1)
    expect(r.referencedCount).toBe(1)
  })

  it('is unchanged for a corpus with no referenced locks', () => {
    const plain = [{ items: [{ provenance: rec(0.3, 10) }, { provenance: rec(0.1, 10) }] }]
    const r = sessionCoachContribution(plain)
    expect(r.coachContribRatio).toBe(0.2)
    expect(r.referencedCount).toBe(0)
    expect(r.scoredCount).toBe(2)
  })
})
