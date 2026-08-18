import { describe, it, expect } from 'vitest'
import { evaluateProvenanceSilence, SETTLE_MS, SILENCE_WINDOW_MS } from './monitorSilence'

const NOW = '2026-08-17T12:00:00.000Z'
const ago = ms => new Date(new Date(NOW).getTime() - ms).toISOString()
const HOUR = 3600_000

describe('the three answers zero rows can have', () => {
  it('checks recorded → alive', () => {
    const r = evaluateProvenanceSilence({ now: NOW, checkTimes: [ago(2 * HOUR)], commitmentTimes: [ago(3 * HOUR)] })
    expect(r.status).toBe('ok')
  })

  it('locks promised, nothing recorded → ALERT', () => {
    const r = evaluateProvenanceSilence({ now: NOW, checkTimes: [], commitmentTimes: [ago(3 * HOUR)] })
    expect(r.status).toBe('alert')
    expect(r.detail).toMatch(/NOT ONE produced a provenance check/)
  })

  it('nothing at all → UNKNOWN, and it must not read as an all-clear', () => {
    // The mistake this encodes: two new signals were reported at "live prevalence 0"
    // when zero coach turns had run since the deploy. Zero-out-of-zero is no measurement.
    const r = evaluateProvenanceSilence({ now: NOW, checkTimes: [], commitmentTimes: [] })
    expect(r.status).toBe('unknown')
    expect(r.status).not.toBe('ok')
    expect(r.detail).toMatch(/not an all-clear/)
  })
})

describe('the window', () => {
  it('a check just outside 24h does not vouch for today', () => {
    const r = evaluateProvenanceSilence({
      now: NOW,
      checkTimes: [ago(SILENCE_WINDOW_MS + HOUR)],
      commitmentTimes: [ago(3 * HOUR)],
    })
    expect(r.status).toBe('alert')
    // ...but the timestamp is still surfaced, so the panel can say how long it has been.
    expect(r.lastCheckAt).toBeTruthy()
  })

  it('a commitment older than the window cannot raise an alarm today', () => {
    const r = evaluateProvenanceSilence({
      now: NOW, checkTimes: [], commitmentTimes: [ago(SILENCE_WINDOW_MS + HOUR)],
    })
    expect(r.status).toBe('unknown')
  })
})

describe('the settle period — a lock and its check are two different requests', () => {
  it('a commitment from one minute ago cannot alert on its own', () => {
    const r = evaluateProvenanceSilence({ now: NOW, checkTimes: [], commitmentTimes: [ago(60_000)] })
    expect(r.status).toBe('unknown')
    expect(r.commitmentsAll).toBe(1)
    expect(r.commitments).toBe(0)
    expect(r.detail).toMatch(/too recent to judge/)
  })

  it('once settled, the same commitment does alert', () => {
    const r = evaluateProvenanceSilence({ now: NOW, checkTimes: [], commitmentTimes: [ago(SETTLE_MS + 60_000)] })
    expect(r.status).toBe('alert')
  })
})

describe('the failure direction — it may miss an outage, it may not invent one', () => {
  it('garbage timestamps are ignored rather than counted as activity', () => {
    const r = evaluateProvenanceSilence({ now: NOW, checkTimes: ['nope'], commitmentTimes: ['also nope'] })
    expect(r.status).toBe('unknown')
    expect(r.checks).toBe(0)
    expect(r.commitments).toBe(0)
  })

  it('dark sessions are carried but NEVER raise the status', () => {
    // Observational only: a re-emitted [DONE:] locks nothing new, so a session with a
    // commitment and no check is normal. Recording the distribution comes first; a
    // threshold, if ever, comes from the data — the rule 051 set.
    const r = evaluateProvenanceSilence({
      now: NOW, checkTimes: [ago(HOUR)], commitmentTimes: [ago(2 * HOUR)], darkSessions: 9,
    })
    expect(r.status).toBe('ok')
    expect(r.darkSessions).toBe(9)
  })
})

describe('backtest — the outage that actually happened', () => {
  // Real shape from provenance_checks / coach_commitments, 2026-08-06 through 08-09:
  // the scaffold arm was never wired to the table, so locks were promised daily and the
  // table stayed empty. It was found BY HAND on 08-11. This is the positive control:
  // a detector that cannot fire on the one real outage in the record is not a detector.
  it('fires on 2026-08-08 (8 locks promised, 0 checks recorded)', () => {
    const day = '2026-08-08T23:59:00.000Z'
    const r = evaluateProvenanceSilence({
      now: day,
      checkTimes: [],
      commitmentTimes: Array.from({ length: 8 }, (_, i) => `2026-08-08T1${i}:00:00.000Z`),
    })
    expect(r.status).toBe('alert')
    expect(r.commitments).toBe(8)
  })

  it('stays quiet on 2026-08-16, when recording worked', () => {
    const r = evaluateProvenanceSilence({
      now: '2026-08-16T23:59:00.000Z',
      checkTimes: Array.from({ length: 8 }, (_, i) => `2026-08-16T1${i}:00:00.000Z`),
      commitmentTimes: Array.from({ length: 7 }, (_, i) => `2026-08-16T1${i}:30:00.000Z`),
    })
    expect(r.status).toBe('ok')
  })
})
