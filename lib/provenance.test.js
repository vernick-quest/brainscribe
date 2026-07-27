import { describe, it, expect } from 'vitest'
import { checkProvenance } from '@/lib/provenance'

// checkProvenance is the mechanical composition-drift signal: how much of a "student's"
// locked paragraph the student never actually said. It runs on every paragraph save
// (/api/paragraphs) and, once calibrated, is what will hold the line the coach prompt
// keeps failing to hold on its own — two hand-confirmed audit findings (2026-07-05 and
// 2026-07-10) were exactly this: coach-assembled sentences, rubber-stamped, locked.
//
// So the threshold decision has to be defensible. These pin the CONTRACT — the tuning
// number itself stays in scripts/verify/provenance.mjs. Synthetic text only (public repo).

const say = (...s) => s   // the student's own words, as sources

describe('checkProvenance', () => {
  it('passes text the student actually said', () => {
    const r = checkProvenance(
      'I was nervous before the tournament but I signed up anyway',
      say('i was nervous before the tournament', 'but i signed up anyway'),
    )
    expect(r.pass).toBe(true)
    expect(r.novelFraction).toBe(0)
    expect(r.novelWords).toEqual([])
  })

  it('flags a paragraph built from words the student never used', () => {
    // The shape of the real Jul-10 finding: the student's ideas, but coach-authored
    // architecture and vocabulary they never uttered.
    const r = checkProvenance(
      'Furthermore this demonstrates remarkable vulnerability and profound intellectual courage',
      say('i dont raise my hand', 'i guess im scared of being wrong'),
    )
    expect(r.pass).toBe(false)
    expect(r.novelFraction).toBeGreaterThan(0.34)
    expect(r.novelWords).toContain('vulnerability')
  })

  it('does not punish a short line for a single unmatched word', () => {
    // A haiku line or hook is high-variance: 1 novel word of 3 is already 0.33, so an
    // absolute floor keeps a legitimate short student line from being flagged.
    const r = checkProvenance('push until it pops', say('push until it popped'))
    expect(r.novelWords.length).toBeLessThanOrEqual(1)
    expect(r.pass).toBe(true)
  })

  it('never flags when there is nothing substantive to judge', () => {
    for (const empty of ['', '   ', 'and the of a']) {
      const r = checkProvenance(empty, say('anything'))
      expect(r.pass).toBe(true)
      expect(r.contentCount).toBe(0)
    }
  })

  it('fails CLOSED-ish only on real novelty: no sources means everything is novel', () => {
    const r = checkProvenance('a completely coach written sentence about courage', say())
    expect(r.pass).toBe(false)
    expect(r.studentSimilarity).toBe(0)
  })

  it('accepts a bare string as sources, not just an array', () => {
    const r = checkProvenance('the tournament was in vegas', 'the tournament was in vegas')
    expect(r.pass).toBe(true)
    expect(r.novelFraction).toBe(0)
  })

  it('honours an explicit threshold override', () => {
    const text = 'nervous tournament vegas competing strangers'
    const sources = say('nervous tournament vegas')
    expect(checkProvenance(text, sources, { noveltyThreshold: 0.9 }).pass).toBe(true)
    expect(checkProvenance(text, sources, { noveltyThreshold: 0.05 }).pass).toBe(false)
  })

  it('reports studentSimilarity as the complement of novelFraction', () => {
    const r = checkProvenance('alpha beta gamma delta', say('alpha beta'))
    expect(r.studentSimilarity).toBeCloseTo(1 - r.novelFraction, 10)
  })
})
