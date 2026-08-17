// The ⚠ column is a PROMISE, not a patch.
//
// Robert: "any warnings that need my attention should get flagged here, this is a CTA
// for me." It counted only guardrail-audit findings, so Sierra rendered a dash while
// carrying a CRITICAL no_draft_despite_locks — which is exactly why finding her problem
// took a remote-in.
//
// THE DESIGN RULE: every detector declares whether it feeds this column, and the default
// is YES. Adding a detector without deciding is how the promise quietly breaks, so a
// source that opts out must say so here, in writing, with a reason.
export const ATTENTION_SOURCES = {
  session_health:  { feeds: true,  why: 'mechanical: did the student\'s work survive' },
  guardrail_audit: { feeds: true,  why: 'coaching quality — a judged breach still needs a human' },
  lock_over_claim: { feeds: true,  why: 'recorded fact: a lock was claimed and the write did not land' },
  revision_refused:{ feeds: true,  why: 'the guard refused a write the student was told had landed' },
}

export const ATTENTION_RANK = { critical: 0, high: 1, medium: 2 }

// WHAT THE NUMBER COUNTS — measured, not guessed.
//
// Counting raw findings was tried against live data and rejected: it gave Elio 4 and
// Sierra 4, rendering four historical mediums identical in magnitude to one genuine
// critical. The actionable unit is the SESSION — you open a session, not a finding — so
// a session with four findings is one thing to look at, not four.
//
// Two exclusions keep it from becoming noise, which is the failure that matters most
// here: a CTA that over-counts trains the reader to skim, and then it protects nobody.
//   • pre-existing (pre-2026-07-21 scaffold-era) findings — real, already filed, and
//     15 of them would bury the 4 live ones.
//   • anything acknowledged/resolved — answered is not outstanding.
//
// `items` is every contributing finding so a click can land on the finding itself
// rather than dumping the reader on the tab to go hunting.
export function attentionForStudent({
  healthFindings = [],
  auditFindings = [],
  lockOverClaimSessions = [],
  refusedRevisionSessions = [],
} = {}) {
  const items = []

  for (const f of healthFindings) {
    if (f.acknowledged || f.pre_existing) continue
    items.push({ source: 'session_health', sessionId: f.session_id, severity: f.severity, label: f.signal, detail: f.detail ?? null })
  }
  for (const f of auditFindings) {
    if (f.resolved || f.severity === 'none') continue
    // The judge's scale is low/medium/high; map into the shared one so a high breach
    // and a high health finding sort together instead of by accident of vocabulary.
    const severity = f.severity === 'high' ? 'high' : 'medium'
    items.push({ source: 'guardrail_audit', sessionId: f.session_id, severity, label: 'guardrail breach', detail: null })
  }
  for (const s of lockOverClaimSessions) {
    items.push({ source: 'lock_over_claim', sessionId: s.id, severity: 'critical', label: 'lock over-claim', detail: `${s.count} recorded` })
  }
  for (const s of refusedRevisionSessions) {
    items.push({ source: 'revision_refused', sessionId: s.id, severity: s.crossSection ? 'high' : 'medium', label: 'revision refused', detail: s.kind ?? null })
  }

  // De-duplicate to sessions: the count is "how many sessions need me".
  const bySession = new Map()
  for (const it of items) {
    const cur = bySession.get(it.sessionId)
    if (!cur || ATTENTION_RANK[it.severity] < ATTENTION_RANK[cur.severity]) {
      bySession.set(it.sessionId, { ...it, all: [...(cur?.all ?? []), it] })
    } else {
      cur.all.push(it)
    }
  }

  const sessions = [...bySession.values()]
    .sort((a, b) => ATTENTION_RANK[a.severity] - ATTENTION_RANK[b.severity])

  // Colour follows the WORST, never the newest — an old critical must not be recoloured
  // by a fresh medium arriving after it.
  const worst = sessions.length
    ? sessions.reduce((w, s) => (ATTENTION_RANK[s.severity] < ATTENTION_RANK[w] ? s.severity : w), sessions[0].severity)
    : null

  return { count: sessions.length, worst, sessions, findingCount: items.length }
}
