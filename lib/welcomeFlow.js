// lib/welcomeFlow.js — the order of questions in /welcome, as a pure resolver.
//
// ── Why this exists ──────────────────────────────────────────────────────────
// The Beta Circle code used to be asked FIRST: the init() effect in
// app/(auth)/welcome/page.js jumped straight to the code step for anyone without
// access_granted and without a relationship, and returned — before the name nudge
// and before the age question ever rendered. Anyone who signed in without a code
// therefore sat in the DB with age_bracket = null and coppa_consent_required =
// false, and the parent-first under-13 flow (migration 055) NEVER RAN, because it
// lives behind the age question they never reached.
//
// Age is the cheaper question and the more important one, so it goes first:
//
//     age  →  name (only when the Google name looks off)  →  access-code  →  role
//
// with the code step now the LAST gate before the app rather than the first.
//
// ── The invariant this file exists to hold ───────────────────────────────────
// An UNDER-13 answer leaves the funnel immediately into the parent-first flow.
// A child is never asked for a Beta Circle code (they cannot hold one, and asking
// is a small dark pattern) and never picks a role (under-13 is always a student).
// That is asserted exhaustively in welcomeFlow.test.js over every flag combination.
//
// This is CLIENT-SIDE QUESTION ORDER ONLY. The real enforcement is server-side —
// canReachCoach() in lib/access.js (COPPA gate AND access gate) — which this
// change does not touch, and lib/coppa.js, which stays byte-for-byte unchanged.

/** The happy-path order, for reference/readability. Not used for control flow. */
export const WELCOME_ORDER = ['age', 'name', 'access-code', 'role']

/**
 * PURE: which step comes after the one just completed?
 *
 * @param from  the step the user just finished: 'age' | 'name' | 'access-code'
 * @param state.ageBracket   '13plus' | 'under13' | null — the answer just given
 * @param state.nameNudge    the Google display name looked off and hasn't been confirmed
 * @param state.accessGated  no access_granted and no relationship → the code step applies
 * @returns the next step id
 */
export function nextWelcomeStep(from, { ageBracket = null, nameNudge = false, accessGated = false } = {}) {
  // The name nudge is asked once, right after age, for BOTH brackets — the name
  // feeds the email we send a parent, so it matters most on the under-13 path.
  if (from === 'age' && nameNudge) return 'name'

  // UNDER-13 INVARIANT (see header): the only way out of the age answer is the
  // parent-first flow. Checked BEFORE any access-code/role branch so no
  // combination of flags can route a child to the code wall.
  if (ageBracket === 'under13') return 'parent-email'

  // A just-redeemed code clears the gate. Checked explicitly because the caller
  // resolves the next step in the same tick it clears its accessGated state, so
  // the flag it passes here can still read stale.
  if (from === 'access-code') return 'role'

  return accessGated ? 'access-code' : 'role'
}
