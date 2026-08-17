import { describe, it, expect } from 'vitest'
import { signalFingerprint, applyReviews } from './draftIntegrityReview'

// A minimal flagged-session shape (the fields the fingerprint reads).
const flag = (over = {}) => ({
  sessionId: 's1',
  severity: 'warn',
  noScaffold: false,
  studentReportedMissing: false,
  finalWords: 100,
  workingWords: 100,
  orphanedWords: 0,
  cursorOutOfRange: false,
  renderedFromParagraphs: true,
  orphanedComponents: [],
  unfilledComponents: [],
  droppedComponents: [],
  brokenCommitments: [],
  ...over,
})

describe('signalFingerprint', () => {
  it('is stable across array ordering and object vs string entries', () => {
    const a = flag({ droppedComponents: ['evidence', 'hook'], brokenCommitments: [{ component_id: 'b' }, { component_id: 'a' }] })
    const b = flag({ droppedComponents: ['hook', 'evidence'], brokenCommitments: [{ component_id: 'a' }, { component_id: 'b' }] })
    expect(signalFingerprint(a)).toBe(signalFingerprint(b))
  })

  it('ignores cosmetic fields (timestamps, name, preview)', () => {
    const a = flag()
    const b = flag({ createdAt: '2026-01-01', completedAt: '2026-02-02', studentName: 'Mia', assignmentPreview: 'whatever' })
    expect(signalFingerprint(a)).toBe(signalFingerprint(b))
  })

  it('changes when a scaffold appears (noScaffold flips)', () => {
    expect(signalFingerprint(flag({ noScaffold: true }))).not.toBe(signalFingerprint(flag({ noScaffold: false })))
  })

  it('changes when the draft is repaired (word counts / orphaned move)', () => {
    const before = flag({ finalWords: 74, workingWords: 185, orphanedWords: 111 })
    const after = flag({ finalWords: 185, workingWords: 185, orphanedWords: 0 })
    expect(signalFingerprint(before)).not.toBe(signalFingerprint(after))
  })

  it('empty/garbage input does not throw', () => {
    expect(signalFingerprint(null)).toBe('')
    expect(signalFingerprint(undefined)).toBe('')
    expect(typeof signalFingerprint({})).toBe('string')
  })
})

describe('applyReviews — visibility', () => {
  it('an unreviewed alert is always shown, with review=null', () => {
    const f = flag()
    const { flagged, hiddenResolved } = applyReviews([f], [])
    expect(flagged).toHaveLength(1)
    expect(flagged[0].review).toBeNull()
    expect(flagged[0].signal).toBe(signalFingerprint(f))
    expect(hiddenResolved).toBe(0)
  })

  it('resolved (signal unchanged) is hidden by default and counted', () => {
    const f = flag()
    const review = { session_id: 's1', status: 'resolved', note: 'fixed', signal: signalFingerprint(f) }
    const { flagged, hiddenResolved } = applyReviews([f], [review])
    expect(flagged).toHaveLength(0)
    expect(hiddenResolved).toBe(1)
  })

  it('not_relevant (signal unchanged) is hidden by default', () => {
    const f = flag()
    const review = { session_id: 's1', status: 'not_relevant', signal: signalFingerprint(f) }
    expect(applyReviews([f], [review]).flagged).toHaveLength(0)
  })

  it('watching is never hidden', () => {
    const f = flag()
    const review = { session_id: 's1', status: 'watching', signal: signalFingerprint(f) }
    const { flagged } = applyReviews([f], [review])
    expect(flagged).toHaveLength(1)
    expect(flagged[0].review.status).toBe('watching')
    expect(flagged[0].review.signalChanged).toBe(false)
  })

  it('showResolved brings hidden verdicts back', () => {
    const f = flag()
    const review = { session_id: 's1', status: 'resolved', signal: signalFingerprint(f) }
    const { flagged, hiddenResolved } = applyReviews([f], [review], { showResolved: true })
    expect(flagged).toHaveLength(1)
    expect(flagged[0].review.status).toBe('resolved')
    expect(hiddenResolved).toBe(0)
  })
})

// The route builds TWO different flag shapes. The noScaffold branch hand-rolls its
// object and originally omitted studentReportedMissing entirely — so a student
// reporting missing work left the fingerprint byte-identical and a 'resolved' verdict
// kept hiding it (found by adversarial review, 2026-08-08). These fixtures mirror the
// ROUTE's real shapes so that divergence can't come back unnoticed.
const noScaffoldFlagFromRoute = (over = {}) => ({
  sessionId: 's1', studentName: 'X', studentId: 'u1', status: 'complete',
  createdAt: 'a', completedAt: 'b', assignmentPreview: 'p',
  studentReportedMissing: false, studentNote: null, studentConfirmedOk: false,
  severity: 'warn',
  reasons: ['finished after 9 messages with NO scaffold at all'],
  finalWords: 100, workingWords: 0, orphanedWords: 0,
  orphanedComponents: [], unfilledComponents: [], droppedComponents: [],
  brokenCommitments: [], renderedFromParagraphs: true,
  cursorOutOfRange: false, targetWords: null, shortfallPct: null, noScaffold: true,
  ...over,
})

describe('route-shaped noScaffold flags (regression: adversarial finding H1)', () => {
  it('carries studentReportedMissing, so a student report MOVES the fingerprint', () => {
    const before = noScaffoldFlagFromRoute()
    const after = noScaffoldFlagFromRoute({ studentReportedMissing: true, severity: 'alert' })
    expect(signalFingerprint(before)).not.toBe(signalFingerprint(after))
  })

  it('a RESOLVED scaffold-less session reappears once the student reports work missing', () => {
    const reviewed = noScaffoldFlagFromRoute()
    const review = { session_id: 's1', status: 'resolved', note: 'coach skipped structure deliberately', signal: signalFingerprint(reviewed) }
    // Still settled while nothing has changed.
    expect(applyReviews([reviewed], [review]).flagged).toHaveLength(0)
    // Student speaks up → must resurface, marked stale.
    const reported = noScaffoldFlagFromRoute({ studentReportedMissing: true, severity: 'alert' })
    const { flagged } = applyReviews([reported], [review])
    expect(flagged).toHaveLength(1)
    expect(flagged[0].review.signalChanged).toBe(true)
  })

  it('a missing studentReportedMissing key still fingerprints as false (no crash, defined default)', () => {
    const partial = { ...noScaffoldFlagFromRoute() }
    delete partial.studentReportedMissing
    expect(signalFingerprint(partial)).toBe(signalFingerprint(noScaffoldFlagFromRoute({ studentReportedMissing: false })))
  })
})

describe('applyReviews — legacy/degenerate review rows', () => {
  it('a review row with no signal resurfaces the alert rather than hiding it', () => {
    const f = flag()
    const legacy = { session_id: 's1', status: 'resolved', signal: null }
    const { flagged } = applyReviews([f], [legacy])
    expect(flagged).toHaveLength(1)
    expect(flagged[0].review.signalChanged).toBe(true)
  })

  it('a review for an unrelated session never suppresses this one', () => {
    const f = flag()
    const other = { session_id: 'someone-else', status: 'resolved', signal: signalFingerprint(f) }
    expect(applyReviews([f], [other]).flagged).toHaveLength(1)
  })
})

describe('applyReviews — the stale-resolved trap (core requirement)', () => {
  it('a RESOLVED alert REAPPEARS once its underlying signal changes', () => {
    // Reviewed + resolved against the original signal (e.g. no scaffold).
    const reviewedFlag = flag({ noScaffold: true, severity: 'warn' })
    const review = {
      session_id: 's1',
      status: 'resolved',
      note: 'looked into it, coach skipped structure on purpose',
      signal: signalFingerprint(reviewedFlag),
    }

    // Same session, unchanged → stays hidden.
    expect(applyReviews([reviewedFlag], [review]).flagged).toHaveLength(0)

    // Later the signal MOVES — a scaffold now exists and the draft looks lossy.
    const changedFlag = flag({ noScaffold: false, severity: 'alert', orphanedWords: 90, finalWords: 40, workingWords: 130 })
    const { flagged, hiddenResolved } = applyReviews([changedFlag], [review])

    expect(flagged).toHaveLength(1)                    // resurfaced
    expect(hiddenResolved).toBe(0)
    expect(flagged[0].review.status).toBe('resolved')  // verdict still visible…
    expect(flagged[0].review.signalChanged).toBe(true) // …but flagged as stale
  })

  it('a student reporting missing work after a resolve resurfaces it', () => {
    const f = flag()
    const review = { session_id: 's1', status: 'resolved', signal: signalFingerprint(f) }
    expect(applyReviews([f], [review]).flagged).toHaveLength(0)
    const nowReported = flag({ studentReportedMissing: true, severity: 'alert' })
    const { flagged } = applyReviews([nowReported], [review])
    expect(flagged).toHaveLength(1)
    expect(flagged[0].review.signalChanged).toBe(true)
  })
})

describe('fingerprint covers the recorded-fact signals (2026-08-17)', () => {
  it('a NEW lock over-claim resurfaces a resolved verdict', () => {
    const before = flag({ lockOverClaims: 0 })
    const review = { session_id: 's1', status: 'resolved', signal: signalFingerprint(before) }
    expect(applyReviews([before], [review]).flagged).toHaveLength(0)
    const after = flag({ lockOverClaims: 1, severity: 'alert' })
    const { flagged } = applyReviews([after], [review])
    expect(flagged).toHaveLength(1)
    expect(flagged[0].review.signalChanged).toBe(true)
  })

  it('a NEW refused revision resurfaces a resolved verdict', () => {
    const before = flag({ refusedRevisions: [] })
    const review = { session_id: 's1', status: 'resolved', signal: signalFingerprint(before) }
    expect(applyReviews([before], [review]).flagged).toHaveLength(0)
    const after = flag({ refusedRevisions: [{ id: 'hook', kind: 'cross-section' }], severity: 'alert' })
    expect(applyReviews([after], [review]).flagged).toHaveLength(1)
  })
})
