import { describe, it, expect } from 'vitest'
import { attentionForStudent, ATTENTION_SOURCES } from './attention'

const health = (over = {}) => ({ session_id: 's1', signal: 'no_draft_despite_locks', severity: 'critical', detail: 'd', pre_existing: false, acknowledged: false, ...over })
const audit = (over = {}) => ({ session_id: 's2', severity: 'high', resolved: false, ...over })

describe('the design rule', () => {
  it('every declared source states whether it feeds the column, and why', () => {
    for (const [name, src] of Object.entries(ATTENTION_SOURCES)) {
      expect(typeof src.feeds, `${name}.feeds`).toBe('boolean')
      expect(String(src.why).length, `${name}.why`).toBeGreaterThan(0)
    }
  })
  it('the default is YES — no source silently opts out', () => {
    expect(Object.values(ATTENTION_SOURCES).every(s => s.feeds)).toBe(true)
  })
})

describe('Sierra — the case that motivated the column', () => {
  it('a CRITICAL session-health finding produces a number, not a dash', () => {
    const r = attentionForStudent({ healthFindings: [health()] })
    expect(r.count).toBe(1)
    expect(r.worst).toBe('critical')
  })

  it('four findings on ONE session count as one thing to look at', () => {
    // Measured against live data: counting raw findings gave Sierra 4 and Elio 4,
    // making four historical mediums look identical to one genuine critical.
    const r = attentionForStudent({
      healthFindings: [
        health({ signal: 'no_draft_despite_locks', severity: 'critical' }),
        health({ signal: 'truncated_turn', severity: 'high' }),
        health({ signal: 'overstuffed_section', severity: 'medium' }),
        health({ signal: 'late_scaffold', severity: 'medium' }),
      ],
    })
    expect(r.count).toBe(1)
    expect(r.findingCount).toBe(4)
    expect(r.worst).toBe('critical')
  })
})

describe('noise control — the failure that would defeat the column', () => {
  it('pre-existing findings never count', () => {
    const r = attentionForStudent({ healthFindings: [health({ pre_existing: true })] })
    expect(r.count).toBe(0)
    expect(r.worst).toBeNull()
  })
  it('acknowledged findings never count', () => {
    expect(attentionForStudent({ healthFindings: [health({ acknowledged: true })] }).count).toBe(0)
  })
  it('resolved audit findings never count', () => {
    expect(attentionForStudent({ auditFindings: [audit({ resolved: true })] }).count).toBe(0)
  })
  it("a clean-audit ledger row (severity 'none') never counts", () => {
    expect(attentionForStudent({ auditFindings: [audit({ severity: 'none' })] }).count).toBe(0)
  })
  it('a student with nothing outstanding shows nothing', () => {
    const r = attentionForStudent({})
    expect(r).toMatchObject({ count: 0, worst: null })
  })
})

describe('every in-scope source reaches the column', () => {
  it('session health, guardrail audit, lock over-claims and refused revisions all count', () => {
    const r = attentionForStudent({
      healthFindings: [health({ session_id: 'a' })],
      auditFindings: [audit({ session_id: 'b' })],
      lockOverClaimSessions: [{ id: 'c', count: 2 }],
      refusedRevisionSessions: [{ id: 'd', crossSection: true, kind: 'cross-section' }],
    })
    expect(r.count).toBe(4)
    expect(new Set(r.sessions.map(s => s.source)))
      .toEqual(new Set(['session_health', 'guardrail_audit', 'lock_over_claim', 'revision_refused']))
  })

  it('a lock over-claim is critical — it is a recorded fact, not an inference', () => {
    const r = attentionForStudent({ lockOverClaimSessions: [{ id: 'c', count: 1 }] })
    expect(r.worst).toBe('critical')
  })
})

describe('severity dominates, and colour follows the WORST not the newest', () => {
  it('a later medium cannot recolour an earlier critical', () => {
    const r = attentionForStudent({
      healthFindings: [health({ session_id: 'a', severity: 'critical' })],
      auditFindings: [audit({ session_id: 'b', severity: 'medium' })],
    })
    expect(r.worst).toBe('critical')
  })
  it('worst-first ordering, so a click lands on the most urgent finding', () => {
    const r = attentionForStudent({
      healthFindings: [
        health({ session_id: 'a', severity: 'medium', signal: 'late_scaffold' }),
        health({ session_id: 'b', severity: 'critical' }),
      ],
    })
    expect(r.sessions[0].severity).toBe('critical')
    expect(r.sessions[0].sessionId).toBe('b')
  })
  it('the worst severity WITHIN a session wins for that session', () => {
    const r = attentionForStudent({
      healthFindings: [
        health({ session_id: 'a', severity: 'medium', signal: 'late_scaffold' }),
        health({ session_id: 'a', severity: 'critical' }),
      ],
    })
    expect(r.count).toBe(1)
    expect(r.sessions[0].severity).toBe('critical')
    expect(r.sessions[0].all).toHaveLength(2)
  })
})
