// Stable identity for one breach inside an audit finding.
//
// A finding is one row per audited SESSION, but a session routinely holds several
// distinct breaches (one real assignment currently has three), and each needs its own
// note and resolution. Array position is the obvious key and the wrong one: if a
// finding is ever re-analyzed, positions shift and a verdict would silently reattach
// to a different error. Type + the coach turn it occurred on identifies the same
// breach across re-analysis, and is human-readable in the DB.
export function breachKey(breach, fallbackIndex = 0) {
  if (!breach || typeof breach !== 'object') return `unknown#${fallbackIndex}`
  const type = typeof breach.type === 'string' && breach.type ? breach.type : 'unknown'
  const turn = Number.isInteger(breach.message_index) ? breach.message_index : fallbackIndex
  return `${type}#${turn}`
}

// Roll-up of per-breach verdicts for one finding: how many are answered.
export function breachProgress(breaches, reviews) {
  const list = Array.isArray(breaches) ? breaches : []
  const byKey = reviews ?? {}
  const total = list.length
  const resolved = list.filter((b, i) => byKey[breachKey(b, i)]?.resolved === true).length
  return { total, resolved, allResolved: total > 0 && resolved === total }
}

// Does a stored summary contradict its own breaches?
//
// The judge used to generate `summary` BEFORE `breaches` (schema order), so it could
// narrate "coached cleanly — no integrity breaches were found" and then list three
// HIGH breaches underneath. The schema now generates breaches first, but findings
// already written keep their contradictory prose, and a self-contradicting report is
// worse than no report: it teaches the reader to distrust the panel. Detect it so the
// UI can label the summary as unreliable rather than presenting it as fact.
const CLEAN_CLAIM = /\b(no (integrity )?(breach|breaches|violations)\b|coached cleanly|no breaches were found|nothing (was )?flagged|clean throughout)/i

export function summaryContradictsBreaches(summary, breaches) {
  const text = typeof summary === 'string' ? summary : ''
  const count = Array.isArray(breaches) ? breaches.length : 0
  return count > 0 && CLEAN_CLAIM.test(text)
}
