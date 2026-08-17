import { createServiceClient } from '@/lib/supabase/service'

// lib/subscribers.js — the ONE place an address leaves the waitlist when its owner's
// account goes away.
//
// WHY THIS IS SHARED, not inlined: `subscribers` (migrations 044/066) has NO foreign
// key to `profiles` or `auth.users`, so `deleteUser()`'s cascade cannot reach it.
// Every account-deletion path therefore has to purge it explicitly, and a path that
// forgets is invisible — the delete "succeeds" and the address quietly survives.
// That already happened once (fixed in f8fa522 for the COPPA cron).
//
// ⚠️ THIS IS A PUBLISHED PROMISE. The privacy policy says a waitlist address that
// becomes an account "follows that account instead — including being deleted with the
// account". Any NEW code path that deletes a user must call this, or that sentence
// stops being true. Retention windows for addresses that never became an account are
// a separate concern — see lib/subscriberRetention.js.

/**
 * Remove `email` from the waitlist. Idempotent; safe when the address was never on it.
 *
 * Best-effort by contract: callers invoke this AFTER the account deletion has already
 * succeeded, so a failure here must never fail the caller — it is logged and returned,
 * never thrown. Matching is case-insensitive in effect: /api/subscribe lowercases on
 * insert, and we lowercase here, so a mixed-case profile email still matches.
 *
 * @param service a SERVICE-ROLE client (subscribers has no client write policy)
 * @returns {{ purged: boolean, error: string|null }}
 */
export async function purgeSubscriberEmail(service, email) {
  const addr = String(email ?? '').trim().toLowerCase()
  if (!addr) return { purged: false, error: null }

  const db = service ?? createServiceClient()
  const { error } = await db.from('subscribers').delete().eq('email', addr)
  if (error) {
    console.error('[subscribers] purge failed:', error.message)
    return { purged: false, error: error.message }
  }
  return { purged: true, error: null }
}
