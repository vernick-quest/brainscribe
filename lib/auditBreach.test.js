import { describe, it, expect } from 'vitest'
import { breachKey, breachProgress } from './auditBreach'

describe('breachKey', () => {
  it('identifies a breach by type and coach turn', () => {
    expect(breachKey({ type: 'compose_as_transcription', message_index: 38 })).toBe('compose_as_transcription#38')
  })

  it('is stable when the breach moves position in the array', () => {
    const b = { type: 'claim_stitch', message_index: 12 }
    expect(breachKey(b, 0)).toBe(breachKey(b, 5))
  })

  it('distinguishes two breaches of the same type at different turns', () => {
    expect(breachKey({ type: 'claim_stitch', message_index: 4 }))
      .not.toBe(breachKey({ type: 'claim_stitch', message_index: 9 }))
  })

  it('distinguishes different types at the same turn', () => {
    expect(breachKey({ type: 'claim_stitch', message_index: 4 }))
      .not.toBe(breachKey({ type: 'evidence_supply', message_index: 4 }))
  })

  it('falls back to the array index when the turn is missing, without throwing', () => {
    expect(breachKey({ type: 'claim_stitch' }, 2)).toBe('claim_stitch#2')
    expect(breachKey(null, 3)).toBe('unknown#3')
    expect(breachKey({}, 1)).toBe('unknown#1')
  })
})

describe('breachProgress', () => {
  const breaches = [
    { type: 'compose_as_transcription', message_index: 38 },
    { type: 'claim_stitch', message_index: 12 },
    { type: 'evidence_supply', message_index: 7 },
  ]

  it('counts nothing resolved when there are no reviews', () => {
    expect(breachProgress(breaches, {})).toEqual({ total: 3, resolved: 0, allResolved: false })
  })

  it('counts only the breaches actually marked resolved', () => {
    const reviews = {
      'compose_as_transcription#38': { resolved: true },
      'claim_stitch#12': { resolved: false, note: 'still looking' },
    }
    expect(breachProgress(breaches, reviews)).toEqual({ total: 3, resolved: 1, allResolved: false })
  })

  it('reports allResolved only when every breach is answered', () => {
    const reviews = {
      'compose_as_transcription#38': { resolved: true },
      'claim_stitch#12': { resolved: true },
      'evidence_supply#7': { resolved: true },
    }
    expect(breachProgress(breaches, reviews)).toEqual({ total: 3, resolved: 3, allResolved: true })
  })

  it('a finding with no breaches is never "allResolved"', () => {
    expect(breachProgress([], {})).toEqual({ total: 0, resolved: 0, allResolved: false })
    expect(breachProgress(null, null)).toEqual({ total: 0, resolved: 0, allResolved: false })
  })

  it('ignores a stale review whose key no longer matches any breach', () => {
    const reviews = { 'compose_as_transcription#99': { resolved: true } }
    expect(breachProgress(breaches, reviews).resolved).toBe(0)
  })
})
