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
