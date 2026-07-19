// lib/access.js — Beta Circle cohort helper (migration 045; students-only per 046).
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
