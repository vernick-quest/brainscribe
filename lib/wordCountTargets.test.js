import { describe, it, expect } from 'vitest'
import {
  getRecommendedWordTarget,
  getRecommendedCharTarget,
  recommendedForTarget,
  targetProgress,
  targetLabel,
} from './wordCountTargets'

// The spec's own verification checklist, as executable assertions.
describe('getRecommendedWordTarget — the checklist', () => {
  it('returns null when no maximum is provided', () => {
    expect(getRecommendedWordTarget({})).toBeNull()
    expect(getRecommendedWordTarget({ maxWords: null })).toBeNull()
    // A minimum ALONE is a floor, not a target — still null.
    expect(getRecommendedWordTarget({ minWords: 300 })).toBeNull()
  })

  it('personal statement, 650 max → 585–618', () => {
    const r = getRecommendedWordTarget({ maxWords: 650, assignmentType: 'personal_statement' })
    expect(r).toMatchObject({ low: 585, high: 618, basis: 'percentage' })
  })

  it('standard essay, 500 max → 400–450', () => {
    expect(getRecommendedWordTarget({ maxWords: 500, assignmentType: 'essay' }))
      .toMatchObject({ low: 400, high: 450 })
  })

  it('narrative uses the same band as a standard essay', () => {
    const essay = getRecommendedWordTarget({ maxWords: 500, assignmentType: 'essay' })
    const narrative = getRecommendedWordTarget({ maxWords: 500, assignmentType: 'narrative' })
    expect(narrative).toEqual(essay)
  })

  it('short answer, 200 max → 180–200 (band applies by SIZE, over type)', () => {
    expect(getRecommendedWordTarget({ maxWords: 200, assignmentType: 'essay' }))
      .toMatchObject({ low: 180, high: 200 })
  })

  it('range assignment 300–500 → center ≈ 440', () => {
    const r = getRecommendedWordTarget({ maxWords: 500, minWords: 300 })
    expect(r.center).toBe(440)
    expect(r.low).toBe(420)
    expect(r.high).toBe(460)
    expect(r.basis).toBe('range')
  })

  it('timed mode overrides the assignment type', () => {
    expect(getRecommendedWordTarget({ maxWords: 500, assignmentType: 'personal_statement', isTimedMode: true }))
      .toMatchObject({ low: 375, high: 400 })
  })

  it('an unknown assignment type falls back to the default band', () => {
    const unknown = getRecommendedWordTarget({ maxWords: 500, assignmentType: 'lab_report' })
    expect(unknown).toMatchObject({ low: 400, high: 450 })
  })
})

describe('getRecommendedWordTarget — the traps', () => {
  // The spec's formula fell through to the percentage branch here and recommended
  // 320–360 for a "write exactly 400 words" assignment — telling the student to miss
  // a count the assignment states outright.
  it('min === max is an EXACT count, not 80% of the ceiling', () => {
    expect(getRecommendedWordTarget({ maxWords: 400, minWords: 400 }))
      .toMatchObject({ low: 400, high: 400, center: 400, basis: 'exact' })
  })

  it('a nonsense parse (min > max) still never recommends under the floor', () => {
    const r = getRecommendedWordTarget({ maxWords: 300, minWords: 500 })
    expect(r).toMatchObject({ low: 300, high: 300, basis: 'exact' })
  })

  it('never recommends more than the stated maximum', () => {
    for (const max of [50, 100, 150, 200, 250, 251, 400, 500, 650, 1000]) {
      for (const type of ['essay', 'narrative', 'personal_statement', 'custom', 'other', 'default']) {
        const r = getRecommendedWordTarget({ maxWords: max, assignmentType: type })
        expect(r.high).toBeLessThanOrEqual(max)
        expect(r.low).toBeLessThanOrEqual(r.high)
        expect(r.low).toBeGreaterThan(0)
      }
    }
  })

  it('a stated range never recommends below the stated minimum', () => {
    for (const [min, max] of [[300, 500], [450, 500], [100, 1000], [199, 200], [5, 6]]) {
      const r = getRecommendedWordTarget({ maxWords: max, minWords: min })
      expect(r.low).toBeGreaterThanOrEqual(min)
      expect(r.high).toBeLessThanOrEqual(max)
    }
  })

  it('fails closed on junk from JSONB rather than inventing a target', () => {
    expect(getRecommendedWordTarget({ maxWords: 'not a number' })).toBeNull()
    expect(getRecommendedWordTarget({ maxWords: 0 })).toBeNull()
    expect(getRecommendedWordTarget({ maxWords: -100 })).toBeNull()
    expect(getRecommendedWordTarget({ maxWords: NaN })).toBeNull()
    expect(getRecommendedWordTarget()).toBeNull()
    // A numeric STRING is still a usable ceiling (JSONB round-trips are not typed).
    expect(getRecommendedWordTarget({ maxWords: '500', assignmentType: 'essay' }))
      .toMatchObject({ low: 400, high: 450 })
    // …but junk in the MINIMUM must not corrupt an otherwise good ceiling.
    expect(getRecommendedWordTarget({ maxWords: 500, minWords: 'lots', assignmentType: 'essay' }))
      .toMatchObject({ low: 400, high: 450, basis: 'percentage' })
  })
})

describe('getRecommendedCharTarget', () => {
  it('1600-char limit → 1440–1600 chars, ~240–267 words', () => {
    const r = getRecommendedCharTarget({ maxChars: 1600 })
    expect(r).toMatchObject({ lowChars: 1440, highChars: 1600, approxLowWords: 240, approxHighWords: 267 })
  })

  it('a large character limit uses the type band, not the short-answer band', () => {
    const r = getRecommendedCharTarget({ maxChars: 6000, assignmentType: 'essay' })
    expect(r).toMatchObject({ lowChars: 4800, highChars: 5400 })
  })

  it('returns null with no limit', () => {
    expect(getRecommendedCharTarget({})).toBeNull()
  })
})

describe('recommendedForTarget — the single entry point', () => {
  it('reads a words target from the requirements shape', () => {
    expect(recommendedForTarget({ type: 'words', max: 500 }, { assignmentType: 'essay' }))
      .toMatchObject({ low: 400, high: 450 })
  })

  it('converts a chars target into words for display', () => {
    const r = recommendedForTarget({ type: 'chars', max: 1600 })
    expect(r).toMatchObject({ low: 240, high: 267, basis: 'chars' })
    expect(r.chars).toMatchObject({ lowChars: 1440, highChars: 1600 })
  })

  it('says nothing about paragraph targets or malformed rows', () => {
    expect(recommendedForTarget({ type: 'paragraphs', target: 5 })).toBeNull()
    expect(recommendedForTarget({ type: 'words', min: 300 })).toBeNull()  // floor only
    expect(recommendedForTarget(null)).toBeNull()
    expect(recommendedForTarget('500')).toBeNull()
  })
})

describe('targetProgress', () => {
  const range = { low: 400, high: 450 }

  it('fills against the BOTTOM of the range, so hitting target reads as arriving', () => {
    expect(targetProgress(200, range, 500).fill).toBeCloseTo(0.5)
    expect(targetProgress(400, range, 500)).toMatchObject({ fill: 1, zone: 'in' })
  })

  it('names the four zones', () => {
    expect(targetProgress(0, range, 500).zone).toBe('below')
    expect(targetProgress(399, range, 500).zone).toBe('below')
    expect(targetProgress(425, range, 500).zone).toBe('in')
    expect(targetProgress(450, range, 500).zone).toBe('in')
    expect(targetProgress(470, range, 500).zone).toBe('over')
    expect(targetProgress(501, range, 500).zone).toBe('over-max')
  })

  it('never returns a fill above 1 — past target, colour carries the message', () => {
    expect(targetProgress(9999, range, 500).fill).toBe(1)
  })

  it('degrades to max-relative fill when there is no recommended range', () => {
    expect(targetProgress(250, null, 500)).toMatchObject({ fill: 0.5, zone: 'below' })
    expect(targetProgress(600, null, 500).zone).toBe('over-max')
    expect(targetProgress(100, null, null)).toMatchObject({ fill: 0, zone: 'below' })
  })
})

describe('targetLabel', () => {
  it('shows the range and the ceiling', () => {
    expect(targetLabel({ low: 420, high: 480 }, 500)).toBe('Target: 420–480 · Max: 500')
  })

  it('collapses an exact target and drops a redundant ceiling', () => {
    expect(targetLabel({ low: 400, high: 400 }, 400)).toBe('Target: 400')
    expect(targetLabel({ low: 180, high: 200 }, 200)).toBe('Target: 180–200')
  })

  it('is silent with no range', () => {
    expect(targetLabel(null, 500)).toBeNull()
  })
})
