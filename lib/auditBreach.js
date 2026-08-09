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
