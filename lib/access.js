// lib/access.js — Beta Circle cohort helper (migration 045).
//
// Beta Circle = the locked-rate launch cohort, a FLUID cap of 100 LIVE members.
// The single source of truth for the cap is the live count of profiles with
// is_beta_circle=true. Demo accounts carry is_beta_circle=false (see seed-demo) so
// they never consume a slot, and deleting a member frees theirs automatically.
export const BETA_CIRCLE_CAP = 100

/**
 * Give `userId` a Beta Circle slot if the cohort is under the cap. Best-effort and
 * idempotent (a member already in the cohort just re-sets true — no double count).
 * Returns whether the user holds a slot after the call (false = cap reached or a
 * write miss; the caller's access is unaffected either way).
 *
 * `service` MUST be a service-role client — the gate columns on profiles are
 * REVOKEd from `authenticated` (migration 020/045 territory).
 */
export async function maybeGrantBetaCircle(service, userId) {
  const { count } = await service
    .from('profiles').select('id', { count: 'exact', head: true }).eq('is_beta_circle', true)
  if ((count ?? 0) >= BETA_CIRCLE_CAP) return false
  const { error } = await service.from('profiles').update({ is_beta_circle: true }).eq('id', userId)
  return !error
}
