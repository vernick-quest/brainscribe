// Admin triage for the draft-integrity alerts. Pure logic only (no DB) so it can
// be unit-tested against synthetic flags.
//
// Each flagged session can carry a standing admin verdict (draft_integrity_reviews,
// migration 057): 'resolved' | 'not_relevant' | 'watching' + a note. 'resolved'
// and 'not_relevant' drop out of the default view; 'watching' always stays.
//
// THE STALE-RESOLVED TRAP: a verdict answers the session AS IT WAS AT REVIEW TIME.
// If the underlying signal later changes — a scaffold appears, the draft is
// repaired, the student reports missing work, the numbers move — a "resolved" that
// keeps hiding the alert is exactly how a real regression stays invisible. So we
// fingerprint the alert's determining signals at review time (stored in the review
// row) and, on every recheck, compare against the CURRENT fingerprint. A mismatch
// means the signal moved: the verdict is stale, and the alert resurfaces.

const asNum = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

// Normalize an array of component/commitment entries (strings OR objects) to a
// stable, sorted list of identifying strings so ordering never changes the hash.
function normList(a, ...keys) {
  if (!Array.isArray(a)) return []
  return a
    .map(x => {
      if (x && typeof x === 'object') {
        for (const k of keys) if (x[k] != null) return String(x[k])
        return JSON.stringify(x)
      }
      return String(x)
    })
    .sort()
}

// The determining signals of a draft-integrity alert, canonicalized. Any change to
// these is a change to WHY the session was flagged (or whether it still is), and
// must invalidate a prior verdict. Deliberately excludes cosmetic fields
// (timestamps, assignment preview, student name) that don't change the finding.
export function signalFingerprint(flag) {
  if (!flag || typeof flag !== 'object') return ''
  const canonical = {
    noScaffold: !!flag.noScaffold,
    severity: flag.severity ?? 'none',
    studentReportedMissing: !!flag.studentReportedMissing,
    finalWords: asNum(flag.finalWords),
    workingWords: asNum(flag.workingWords),
    orphanedWords: asNum(flag.orphanedWords),
    cursorOutOfRange: !!flag.cursorOutOfRange,
    renderedFromParagraphs: !!flag.renderedFromParagraphs,
    orphanedComponents: normList(flag.orphanedComponents, 'id', 'label'),
    unfilledComponents: normList(flag.unfilledComponents, 'id', 'label'),
    droppedComponents: normList(flag.droppedComponents, 'id', 'label'),
    brokenCommitments: normList(flag.brokenCommitments, 'component_id', 'id', 'label'),
  }
  return JSON.stringify(canonical)
}

// Join flagged sessions with their standing verdicts and decide visibility.
//   flagged:  the freshly-computed alerts (each with a stable `sessionId`)
//   reviews:  draft_integrity_reviews rows { session_id, status, note, signal,
//             reviewed_at, reviewedByName? }
//   showResolved: bring resolved/not_relevant back into the list
// Returns { flagged: annotated[], hiddenResolved } where each annotated flag gains
// `signal` (current fingerprint, for the client to echo back on a verdict write)
// and `review` ({ status, note, reviewedAt, reviewedByName, signalChanged } | null).
export function applyReviews(flagged, reviews, { showResolved = false } = {}) {
  const byId = new Map()
  for (const r of reviews ?? []) if (r && r.session_id) byId.set(r.session_id, r)

  const annotated = []
  let hiddenResolved = 0

  for (const f of flagged ?? []) {
    const signal = signalFingerprint(f)
    const r = byId.get(f.sessionId)

    let review = null
    if (r) {
      const signalChanged = r.signal !== signal
      review = {
        status: r.status,
        note: r.note ?? null,
        reviewedAt: r.reviewed_at ?? null,
        reviewedByName: r.reviewedByName ?? null,
        signalChanged,
      }
      // 'resolved'/'not_relevant' hide the alert — but ONLY while the signal they
      // were made against still holds. A changed signal resurfaces it regardless.
      // 'watching' never hides. A new (unreviewed) alert never hides.
      const suppressible = r.status === 'resolved' || r.status === 'not_relevant'
      if (suppressible && !signalChanged && !showResolved) {
        hiddenResolved++
        continue
      }
    }

    annotated.push({ ...f, signal, review })
  }

  return { flagged: annotated, hiddenResolved }
}

export const REVIEW_STATUSES = ['resolved', 'not_relevant', 'watching']
