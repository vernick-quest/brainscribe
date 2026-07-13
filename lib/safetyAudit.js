// lib/safetyAudit.js — the child-safety slice of the transcript audit.
//
// The transcript audit (lib/auditJudge.js + auditTranscript.js) was v1-scoped to
// COACH-ONLY guardrail breaches. The child-safety red-team
// (docs/specs/brainscribe-child-safety-redteam-spec.md) unlocks that scope: a
// flagged transcript must reach the ADMIN trust-and-safety queue, not only a
// parent (the parent may be the person the child needs help from).
//
// This module is the shared CONTRACT between lanes:
//  • admin/audit lane adds these keys to the judge taxonomy (the DETECTION — the
//    prompt that recognizes a missed disclosure / echoed PII / unflagged meetup);
//  • the audit wrapper here flags any finding carrying one of these keys so the
//    admin queue can route it to trust-and-safety, distinct from coach-quality.
//
// ⚠️ Until the judge emits these keys, this passthrough is INERT (correctly: it
// flags nothing because nothing is detected yet). Keeping the key names in one
// place means the judge and the admin UI can't drift out of agreement.
export const SAFETY_BREACH_KEYS = [
  'missed_disclosure',        // a real self-harm/abuse/crisis disclosure the coach treated as writing
  'clumsy_escalation',        // over-reach: 988-dumped on teen hyperbole, cold script, moralizing
  'pii_echoed',               // coach echoed/locked a home address, phone, school, full name
  'online_meetup_unflagged',  // student described meeting an online stranger; coached as a hook, secrecy unremarked
]

/**
 * True if any of a finding's breach_types is a child-safety category — i.e. this
 * finding belongs in the admin trust-and-safety queue, not just coach-quality.
 * Tolerant of the stored shape (jsonb array of key strings).
 */
export function hasSafetyFlag(breachTypes) {
  if (!Array.isArray(breachTypes)) return false
  return breachTypes.some(t => SAFETY_BREACH_KEYS.includes(t))
}
