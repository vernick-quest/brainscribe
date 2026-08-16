// lib/subscriberRetention.js — how long a waitlist address is kept.
//
// `subscribers` (migrations 044/066) had NO retention policy: an address stayed
// forever, including long after the person was dismissed or had plainly never come
// back. That was the weakest part of the posture in COPPA-WAITLIST-REVIEW-2026-08-16.md,
// and it is the part fixable without deciding anything contested — this is data
// minimization, which stands on its own without a legal ruling. The open questions
// in that memo (age gate, disclosure, the 312.5(c)(3)/(c)(4) analysis) are NOT
// decided here and nothing below presumes an answer to them.
//
// ⚠️ THESE NUMBERS ARE PUBLISHED. The privacy policy states the same retention
// window (marketing owns that copy; coordinated 2026-08-16). If you change a
// constant here, the policy has to change in the same pass — a published commitment
// we don't keep is exactly the failure the COPPA deletion sweep just fixed.
//
// PURE (no Next/Supabase) so the rules are unit-testable and the cron just applies
// the verdict. Deletion is irreversible, so every rule is tested exhaustively rather
// than expressed as an inline query filter.

/** A never-contacted, never-converted address is kept for 12 months from signup. */
export const NEVER_CONTACTED_TTL_DAYS = 365

/** A dismissed address (spam / duplicate / not a fit) is kept 90 days from dismissal. */
export const DISMISSED_TTL_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole-ms age check. Invalid/missing timestamps are treated as NOT expired (fail-safe). */
function olderThanDays(timestamp, days, now) {
  if (!timestamp) return false
  const t = new Date(timestamp).getTime()
  if (!Number.isFinite(t)) return false
  return now.getTime() - t >= days * DAY_MS
}

/**
 * PURE: should this `subscribers` row be deleted for retention?
 *
 * @param row        { created_at, invited_at, dismissed_at }
 * @param hasProfile does an account already exist for this address?
 * @param now        clock injection for tests
 * @returns { purge: boolean, reason: string }
 *
 * Rules, in precedence order:
 *  1. HAS A PROFILE → never purge. They're a user; the row follows the account
 *     lifecycle instead (and the COPPA 7-day deletion already purges it the moment
 *     that account is deleted — app/api/cron/coppa-cleanup).
 *  2. DISMISSED → purge 90 days after the dismissal. A dismissal is a decision, not
 *     a record worth keeping. This deliberately overrides the note in migration 066
 *     ("the row is kept: deleting it would let the same address re-enter the queue
 *     on a resubmit") — 90 days of spam suppression is worth more than indefinite
 *     retention of someone's address. The dismissal date wins over rule 3 even when
 *     the row is much older, which is the conservative direction (keeps it longer).
 *  3. NEVER CONTACTED and never converted → purge 12 months after signup.
 *
 * NOT covered by design: a row that WAS invited but never became an account is kept
 * indefinitely — no rule matches it. That gap is real and is flagged in the memo;
 * it is left alone deliberately rather than deleting data nobody asked to delete.
 */
export function purgeDecision(row, { hasProfile = false, now = new Date() } = {}) {
  if (!row) return { purge: false, reason: 'no_row' }

  // 1 — the hard stop, checked first so no other rule can reach a real user.
  if (hasProfile) return { purge: false, reason: 'has_profile' }

  // 2 — dismissed rows age out from the dismissal, not from signup.
  if (row.dismissed_at) {
    return olderThanDays(row.dismissed_at, DISMISSED_TTL_DAYS, now)
      ? { purge: true, reason: 'dismissed_expired' }
      : { purge: false, reason: 'dismissed_recent' }
  }

  // 3 — never contacted, never converted.
  if (!row.invited_at) {
    return olderThanDays(row.created_at, NEVER_CONTACTED_TTL_DAYS, now)
      ? { purge: true, reason: 'uncontacted_expired' }
      : { purge: false, reason: 'uncontacted_recent' }
  }

  // Invited, no account yet — see the "NOT covered by design" note above.
  return { purge: false, reason: 'invited_kept' }
}

/** Human-readable summary of the published windows, for logs and copy review. */
export const RETENTION_SUMMARY =
  `uncontacted ${NEVER_CONTACTED_TTL_DAYS}d · dismissed ${DISMISSED_TTL_DAYS}d · never while an account exists`
