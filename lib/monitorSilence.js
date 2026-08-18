// lib/monitorSilence.js — does the shadow monitor still have a pulse?
//
// ── Why this exists ───────────────────────────────────────────────────────────────────
// /api/scaffold records a provenance check for every lock, and SUPPRESSES the recording
// when it cannot trust the score — specifically when the starting-draft read fails for an
// unknown reason. That suppression is deliberate and correct: a fabricated failure poisons
// the calibration set Phase 2 is gated on and can never be identified afterwards, whereas
// a hole in the data is recoverable. Coaching-session chose the recoverable failure.
//
// The cost of that choice is that the failure is SILENT, and its signature is zero rows —
// which is byte-identical to a quiet day when nobody wrote anything. A column-name drift
// in the starting-drafts table would suppress recording for 100% of sessions, and the
// dataset would simply stop growing with nothing anywhere saying so. This module is the
// detector that makes silence reportable.
//
// ── The only honest way to read zero ──────────────────────────────────────────────────
// Zero rows on its own means NOTHING. It took a wrong all-clear to learn that: a
// "live prevalence 0" for two new signals turned out to be zero-out-of-zero — no coach
// turn had run at all since the deploy — and it was reported as a clean bill of health
// when it was no measurement whatsoever.
//
// So zero rows is never a verdict here. It is a question, and the answer needs a WITNESS
// that locks were happening at all. That witness is coach_commitments: written server-side
// by /api/tutor from the raw stream, on a completely different code path from the one that
// records the checks. If the witness says locks happened and the table is empty, recording
// is dark. If the witness is also empty, the correct answer is "no measurement" — stated
// as such, never dressed up as OK.
//
//   checks > 0                       → 'ok'       recording is alive
//   checks = 0 AND commitments > 0   → 'alert'    🔴 dark while work was happening
//   checks = 0 AND commitments = 0   → 'unknown'  no measurement — NOT all-clear
//
// ── Known blind spots, named on purpose ───────────────────────────────────────────────
// 1. PARTIAL silence is invisible. If a drift suppressed only the sessions that have a
//    starting draft, the rest would keep recording, checks > 0, and this reads 'ok'. The
//    per-session `darkSessions` figure below is carried for exactly that question but is
//    deliberately OBSERVATIONAL ONLY — a session can legitimately have a commitment and no
//    new check (a re-emitted [DONE:] locks nothing new, so needsProvenancePass is false),
//    and a CTA that over-counts trains the reader to skim. Same discipline 051 used: record
//    the distribution first, pick a threshold from it later.
// 2. The witness UNDER-reports. coach_commitments upserts on (session_id, component_id)
//    without touching emitted_at, so only a component's FIRST [DONE:] stamps the window. A
//    day of pure revision shows no witness and reads 'unknown'. That bias is the safe
//    direction — it can miss an outage, it cannot invent one.

export const SILENCE_WINDOW_MS = 24 * 60 * 60 * 1000

// A lock and its check are written by two different requests moments apart. Commitments
// newer than this are not yet expected to have a check, so they must not be able to raise
// an alarm on their own.
export const SETTLE_MS = 15 * 60 * 1000

export const MONITOR_PROVENANCE = 'provenance_recording'

const count = (times, from, to) => times.filter(t => {
  const ms = new Date(t).getTime()
  return Number.isFinite(ms) && ms >= from && ms <= to
}).length

const latest = times => times.reduce((best, t) => {
  const ms = new Date(t).getTime()
  if (!Number.isFinite(ms)) return best
  return best === null || ms > new Date(best).getTime() ? t : best
}, null)

/**
 * @param now              ISO string or Date — evaluation time
 * @param checkTimes       provenance_checks.created_at values (any range; filtered here)
 * @param commitmentTimes  coach_commitments.emitted_at values — the independent witness
 * @param darkSessions     observational only: sessions with a settled commitment and no
 *                         check in the window. Never raises the status.
 */
export function evaluateProvenanceSilence({
  now = new Date(),
  checkTimes = [],
  commitmentTimes = [],
  darkSessions = 0,
  windowMs = SILENCE_WINDOW_MS,
} = {}) {
  const to = new Date(now).getTime()
  const from = to - windowMs

  const checks = count(checkTimes, from, to)
  // Settled only — see SETTLE_MS.
  const commitments = count(commitmentTimes, from, to - SETTLE_MS)
  const commitmentsAll = count(commitmentTimes, from, to)

  const status = checks > 0 ? 'ok' : commitments > 0 ? 'alert' : 'unknown'

  const hours = Math.round(windowMs / 3600000)
  const headline =
    status === 'ok'    ? 'Provenance recording is alive'
  : status === 'alert' ? 'Provenance recording is DARK'
  :                      'Provenance recording: no measurement'

  const detail =
    status === 'ok'
      ? `${checks} check${checks === 1 ? '' : 's'} recorded in ${hours}h.`
  : status === 'alert'
      ? `${commitments} lock${commitments === 1 ? ' was' : 's were'} promised by the coach in the last ${hours}h and NOT ONE produced a provenance check. ` +
        `The most likely cause is the starting-draft read failing, which suppresses recording for every session. Locks are still saving — the shadow signal is not.`
  :     `No locks and no checks in ${hours}h` +
        (commitmentsAll > commitments
          ? `, apart from ${commitmentsAll - commitments} lock(s) too recent to judge. `
          : '. ') +
        `Nothing is wrong and nothing has been proven right — this is an absence of data, not an all-clear.`

  return {
    monitor: MONITOR_PROVENANCE,
    status,
    headline,
    detail,
    checks,
    commitments,
    commitmentsAll,
    darkSessions,
    windowHours: hours,
    lastCheckAt: latest(checkTimes),
    lastCommitmentAt: latest(commitmentTimes),
  }
}
