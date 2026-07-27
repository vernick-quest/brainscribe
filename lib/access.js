// lib/access.js — Beta Circle cohort helper (migration 045; students-only per 046).
//
import { canUseCoach, coachGateResponse } from '@/lib/coppa'

// ── The coach reachability gate, in ONE place ────────────────────────────────
// A user may reach a coach/model/voice endpoint only if BOTH gates pass:
//   1. the COPPA age gate (canUseCoach — lib/coppa.js, byte-for-byte independent), AND
//   2. the Beta-launch access gate (profiles.access_granted === true).
// Enforced ONLY at session-CREATE historically, so any authed 13+ user with no
// code + no invite could call /api/tutor, /api/speak, /api/scribe-token, etc.
// directly and skip the gate entirely (Fable red-team finding #1). Centralized
// here so every model endpoint fetches the same columns and fails the same way.

// The exact profile columns every gated endpoint must read to make the decision.
// Fetch these (plus any endpoint-specific extras like birthdate) so canReachCoach /
// coachGateFailure always see what they need. access_granted requires migration 045.
export const COACH_GATE_COLUMNS =
  'role, age_bracket, coppa_consent_required, coppa_consent_given, access_granted'

/** Convenience read of the shared gate columns for `userId`. Returns the row (or null). */
export async function fetchCoachGate(supabase, userId) {
  const { data } = await supabase
    .from('profiles').select(COACH_GATE_COLUMNS).eq('id', userId).single()
  return data ?? null
}

/**
 * PURE: may this profile reach a coach? COMPOSES the COPPA predicate — it never
 * modifies it — and ANDs the Beta access gate. Fails CLOSED: an odd/missing row
 * (access_granted anything but the literal `true`) is denied.
 */
export function canReachCoach(profile) {
  return canUseCoach(profile) === true && profile?.access_granted === true
}

/**
 * The correct early-return 403 for a failed coach gate, or null if the user may
 * reach the coach. Preserves the TWO DISTINCT failure modes (don't collapse them):
 *   • COPPA fail  → coachGateResponse() (code 'age_verification_required')
 *   • access fail → code 'access_code_required'
 * COPPA is checked first so an under-13 without consent never sees the access copy.
 */
export function coachGateFailure(profile) {
  if (!canUseCoach(profile)) return coachGateResponse()
  if (profile?.access_granted !== true) {
    return Response.json(
      { error: 'Enter your Beta Circle code to start writing with a coach.', code: 'access_code_required' },
      { status: 403 }
    )
  }
  return null
}

//
// Beta Circle = the locked-rate launch cohort, a FLUID cap of 100 LIVE members.
// It counts STUDENTS only (the writers) — parents/teachers get access but never a
// slot, and demo accounts carry is_beta_circle=false (see seed-demo). The single
// source of truth for the cap is the live count of profiles with is_beta_circle=true
// (which, given the student-only grant + migration 046 cleanup, is exactly the
// students). Deleting a member frees their slot automatically.
export const BETA_CIRCLE_CAP = 100

/**
 * Give `userId` a Beta Circle slot IF they're a student and the cohort is under the
 * cap. No-op for non-students (parents/teachers/admin never count). Best-effort and
 * idempotent (a student already in the cohort just returns true — no double count).
 * Returns whether the user holds a slot after the call (false = not a student, cap
 * reached, or a write miss; the caller's access is unaffected either way).
 *
 * `service` MUST be a service-role client — the gate columns on profiles are
 * REVOKEd from `authenticated` (migration 020/045 territory).
 */
export async function maybeGrantBetaCircle(service, userId) {
  const { data: prof } = await service
    .from('profiles').select('role, is_beta_circle').eq('id', userId).maybeSingle()
  if (!prof || prof.role !== 'student') return false   // students only
  if (prof.is_beta_circle) return true                 // already in — no double count
  const { count } = await service
    .from('profiles').select('id', { count: 'exact', head: true }).eq('is_beta_circle', true)
  if ((count ?? 0) >= BETA_CIRCLE_CAP) return false
  const { error } = await service.from('profiles').update({ is_beta_circle: true }).eq('id', userId)
  return !error
}

// ── Per-code redemption caps (migration 049) ─────────────────────────────────
//
// access_codes.max_uses is an OPTIONAL ceiling: NULL = unlimited (every code
// behaves exactly as it did before 049). The ceiling itself is enforced in ONE
// atomic SQL statement — claim_access_code() — because a JS-side check over a
// read `uses` value is racy and would not be a cap at all. What lives here is the
// pure, testable JS either side of that statement:
//   • parseMaxUses        — validating what an ADMIN types (fails closed)
//   • classifyClaimFailure — turning "the claim returned no row" into good copy
// Neither one decides whether a redemption succeeds; SQL does. Keep it that way.

// Postgres `integer` upper bound — a larger value would blow up at insert time.
const PG_INT_MAX = 2147483647

// Warn when a code has been claimed this fraction of the way to its ceiling.
export const ACCESS_CODE_WARN_AT = 0.8

/**
 * PURE: does THIS redemption deserve an ops alert, and which one?
 *   'cap'     — the code just filled up; no one else can redeem it
 *   'warning' — it just crossed the 80% mark
 *   null      — nothing to say (uncapped code, or mid-range)
 *
 * Hitting the ceiling already decommissions a code (claim_access_code's
 * `uses < max_uses` predicate stops matching), but that happens SILENTLY — you'd
 * only find out by opening the admin panel. This is what turns it into something
 * you hear about.
 *
 * Fires exactly ONCE per threshold with no stored state: a successful claim
 * increments `uses` by exactly 1, so an equality check can never double-fire and
 * can never be skipped over. Pass the POST-increment `uses` (claim_access_code
 * returns the updated row).
 */
export function accessCodeAlertLevel(uses, maxUses) {
  if (!Number.isInteger(uses) || !Number.isInteger(maxUses) || maxUses <= 0) return null
  if (uses === maxUses) return 'cap'                       // the crossing itself
  if (uses > maxUses) return null                          // already reported
  const warnAt = Math.ceil(maxUses * ACCESS_CODE_WARN_AT)
  // On a tiny cap the warn point collides with the ceiling — let 'cap' say it.
  return (uses === warnAt && warnAt < maxUses) ? 'warning' : null
}

/** User-facing copy for the two redeem-failure modes. Shared route ↔ tests. */
export const INVALID_CODE_MESSAGE = "That code isn't valid. Check with whoever invited you."
export const CODE_EXHAUSTED_MESSAGE = 'That code has been fully claimed. Ask whoever invited you for a new one.'

/**
 * PURE: validate an admin-supplied redemption limit.
 *
 * Blank / null / undefined → unlimited (`null`), the documented "no cap" input.
 * Anything else must be a POSITIVE integer within Postgres' int range. Fails
 * CLOSED: an unparsable value is an ERROR, never silently "unlimited" — the whole
 * point of the cap is that a typo can't quietly re-open the code.
 *
 * Returns { ok: true, value: number|null } | { ok: false, error: string }.
 */
export function parseMaxUses(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: null }

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '') return { ok: true, value: null }        // blank field = unlimited
    // Digits only: rejects '-1', '1.5', '1e3', ' 12abc', '+5', 'Infinity'.
    if (!/^\d+$/.test(trimmed)) return { ok: false, error: 'Limit must be a whole number, or blank for unlimited.' }
    const n = Number(trimmed)
    if (n === 0) return { ok: false, error: 'Limit must be at least 1 (deactivate the code to stop it entirely).' }
    if (n > PG_INT_MAX) return { ok: false, error: 'Limit is too large.' }
    return { ok: true, value: n }
  }

  if (typeof raw === 'number') {
    if (!Number.isInteger(raw)) return { ok: false, error: 'Limit must be a whole number, or blank for unlimited.' }
    if (raw < 1) return { ok: false, error: 'Limit must be at least 1 (deactivate the code to stop it entirely).' }
    if (raw > PG_INT_MAX) return { ok: false, error: 'Limit is too large.' }
    return { ok: true, value: raw }
  }

  // booleans, objects, arrays — never a valid limit.
  return { ok: false, error: 'Limit must be a whole number, or blank for unlimited.' }
}

/**
 * PURE: the atomic claim returned NO row — why?
 *
 * claim_access_code() deliberately collapses "no such code", "inactive" and
 * "exhausted" into zero rows (one statement, no leaks). The route re-selects the
 * row with the service role and passes it here to pick the right 400 body.
 *
 * `row` = the re-selected access_codes row, or null/undefined if none exists.
 * Returns 'code_exhausted' ONLY for a live code that has hit its ceiling;
 * everything else (missing, inactive, unlimited, unreadable) → 'invalid_code'.
 * Fails toward the vaguer message: never tell a stranger that a code they don't
 * hold merely ran out.
 */
export function classifyClaimFailure(row) {
  if (!row) return 'invalid_code'                       // no such code
  if (row.active !== true) return 'invalid_code'        // deactivated — same copy as before
  const max = row.max_uses
  if (typeof max !== 'number' || !Number.isFinite(max)) return 'invalid_code' // uncapped: not an exhaustion
  return (row.uses ?? 0) >= max ? 'code_exhausted' : 'invalid_code'
}

/** The 400 body for a classifyClaimFailure() result. */
export function claimFailureBody(reason) {
  return reason === 'code_exhausted'
    ? { error: CODE_EXHAUSTED_MESSAGE, code: 'code_exhausted' }
    : { error: INVALID_CODE_MESSAGE, code: 'invalid_code' }
}
