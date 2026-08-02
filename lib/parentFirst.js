// lib/parentFirst.js — parent-led consent for under-13 accounts.
//
// PURE brain (no Next/Supabase) so the rules are unit-testable — same split as
// lib/coppa.js, whose predicates this deliberately does NOT touch.
//
// ── Why this exists ───────────────────────────────────────────────────────────────────
// Fable red-team finding #3, code-traced and confirmed: a determined minor with a second
// email address and a fresh Google account can satisfy every check in the email-plus
// consent flow. Both factors land in one inbox they control.
//
// The root cause is the ORDER OF OPERATIONS, not the strength of the verification step.
// In the child-first flow the child creates an account, THEN nominates a parent to approve
// the account that already exists — so there is always something pending that the child
// can cause to be approved. Khan Academy inverts this: an under-13 cannot self-create, and
// the parent is the one who makes the account.
//
// Parent-first removes the approvable object. Nothing exists for a child to get approved;
// consent is a by-product of a parent who independently created their own account and
// affirmatively invited a child.
//
// ── Honest residual risk (for counsel — state it plainly) ─────────────────────────────
// This raises the bar; it does not make fraud impossible. A determined minor could create
// a "parent" account with a second email and invite themselves. The legal difference is
// that they must affirmatively POSE as a parent — register as one, and act as one — rather
// than merely receive and click an approval link addressed to them. COPPA's standard is
// *reasonable efforts*, not perfection. Whether this specific mechanism qualifies as VPC
// is a legal judgment, not an engineering one. This module builds the mechanism; it makes
// no claim about its legal sufficiency.

/**
 * May this parent's invite establish COPPA consent for this child?
 *
 * Called when an under-13 claims a parent-issued invite. Every guard here mirrors one the
 * email-plus path already enforces via validateConsentBinding — same protections, applied
 * at the point where the relationship is actually formed.
 *
 * @param parent {{ id, email, role }}  the authenticated inviter, read from the DB
 * @param child  {{ id, email, age_bracket, coppa_consent_given }}  the claiming user
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function evaluateParentLedConsent({ parent, child } = {}) {
  if (!parent?.id || !child?.id) return { ok: false, reason: 'missing_party' }

  // Self-approval, the whole point of the exercise. An account cannot consent for itself
  // even if it somehow holds both roles.
  if (parent.id === child.id) return { ok: false, reason: 'self_consent' }

  // Same mailbox = same person, in every way that matters here. validateConsentBinding
  // enforces the mirror of this on the email-plus path.
  const pEmail = String(parent.email ?? '').trim().toLowerCase()
  const cEmail = String(child.email ?? '').trim().toLowerCase()
  if (pEmail && cEmail && pEmail === cEmail) return { ok: false, reason: 'same_email' }

  // Only a parent may do this. A teacher's invite links a student for oversight; it is
  // explicitly NOT parental consent, and a school cannot consent on a parent's behalf.
  if (parent.role !== 'parent') return { ok: false, reason: 'inviter_not_parent' }

  // A student-role account can never be the consenting party, whatever else is true.
  if (child.role === 'parent') return { ok: false, reason: 'child_role_conflict' }

  // Only under-13s need this. Granting it to a 13+ account would write a consent record
  // that means nothing and muddies the audit trail.
  if (child.age_bracket !== 'under13') return { ok: false, reason: 'not_under13' }

  // Already consented — don't re-grant, don't overwrite an earlier, truer timestamp.
  if (child.coppa_consent_given === true) return { ok: false, reason: 'already_granted' }

  return { ok: true, reason: null }
}

/**
 * Copy for the under-13 dead end.
 *
 * Deliberately not a rejection: a 10-year-old reading this has done nothing wrong. It says
 * what happens next and who does it. Kept here rather than inline in the page so the
 * wording is reviewable next to the rules it describes.
 */
export const UNDER13_SETUP_COPY = {
  heading: 'A parent needs to set this up',
  body: 'BrainScribe accounts for under-13s are created by a parent or guardian. ' +
        "Tell us their email and we'll send them the link to get you started.",
  cta: 'Ask a parent to set this up →',
  // Shown after the email is sent. No "approve" language anywhere — there is deliberately
  // nothing to approve.
  sent: "We've emailed them. Once they set up your account, sign back in with this same " +
        'email and everything will be waiting for you.',
}
