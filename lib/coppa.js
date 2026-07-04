// lib/coppa.js — the COPPA age-gate predicates, in ONE place.
//
// Every endpoint that reads or moves the age gate (confirm-role, birthdate,
// sessions, tutor, scribe, scribe-token, coppa/complete) calls these instead of
// re-deriving the rules inline, so the invariants can't drift apart per-endpoint:
//   • birthdate is the source of truth; age_bracket is DERIVED (never a DB trigger).
//   • COPPA actual-knowledge is sticky: self may move INTO under-13, never out.
//   • Consent binds to the invited parent (email match), and the signer is never
//     the student being approved.
//   • Under-13 without completed consent never reaches a model/voice endpoint.
//
// Everything here is PURE (no DB access) so it's testable and usable from both
// server routes and client components. Callers do their own DB reads and hand
// the rows in.

/** Whole years between dob and ref (UTC), accounting for month/day. */
export function ageInYears(dob, ref) {
  let age = ref.getUTCFullYear() - dob.getUTCFullYear()
  const m = ref.getUTCMonth() - dob.getUTCMonth()
  if (m < 0 || (m === 0 && ref.getUTCDate() < dob.getUTCDate())) age--
  return age
}

/** Derive the age bracket from a birthdate Date. The ONLY place '<13' is defined. */
export function deriveAgeBracket(dob, ref = new Date()) {
  return ageInYears(dob, ref) < 13 ? 'under13' : '13plus'
}

/**
 * Sticky COPPA protection: once an account has EVER been marked under-13 —
 * age_bracket='under13' OR coppa_consent_required=true — it stays protected until
 * a verified parent/admin moves it. Both flags are checked because legacy rows can
 * carry one without the other, and a re-declaration must not escape via either.
 */
export function isCoppaProtected(profile) {
  return profile?.age_bracket === 'under13' || profile?.coppa_consent_required === true
}

/**
 * The coach age gate — may this account talk to a coach (create sessions, stream
 * /api/tutor, transcribe voice)? Role-independent. True for: admins, any account
 * with COMPLETED parental consent, or a 13+ assertion with no outstanding consent
 * requirement. `coppa_consent_required` is re-checked even when the bracket reads
 * '13plus' so a flipped bracket can never outrun an unmet consent obligation.
 */
export function canUseCoach(profile) {
  return profile?.role === 'admin'
    || profile?.coppa_consent_given === true
    || (profile?.age_bracket === '13plus' && !profile?.coppa_consent_required)
}

/** The shared 403 for a failed coach age gate (one message/code everywhere). */
export function coachGateResponse() {
  return Response.json(
    { error: 'Please confirm your age before writing with a coach.', code: 'age_verification_required' },
    { status: 403 }
  )
}

/**
 * May `actor` move `target`'s age gate to `newBracket`?
 * Pure decision over rows the caller already fetched; `hasWatcherLink` is the
 * caller's `relationships` lookup (actor→target).
 *
 * Directional rules:
 *   • ADMIN: anything.
 *   • SELF: may move INTO protection, never out of it (sticky actual-knowledge).
 *   • OTHER: requires a watcher link AND parental standing — the recorded
 *     consenting guardian, or (when no guardian is recorded yet) any linked
 *     PARENT, never a teacher — the bootstrap/first-correction path.
 *
 * Returns { allowed, parentEditing } or { allowed:false, status, error, code }.
 */
export function evaluateGateEdit({ actorId, actorRole, targetId, target, newBracket, hasWatcherLink }) {
  const isAdmin = actorRole === 'admin'
  const isSelf = actorId === targetId

  if (isAdmin) return { allowed: true, parentEditing: false }

  if (isSelf) {
    if (isCoppaProtected(target) && newBracket === '13plus') {
      return {
        allowed: false, status: 403, code: 'coppa_locked',
        error: 'This account is registered as under 13 and needs parental approval to change.',
      }
    }
    return { allowed: true, parentEditing: false }
  }

  if (!hasWatcherLink) {
    return { allowed: false, status: 403, code: 'not_linked', error: 'You are not authorized to edit this account.' }
  }

  // Bare relationship membership is not enough: `relationships` carries no role,
  // so a read-only co-parent or a linked teacher would otherwise be able to move
  // the age gate and (when resolving to under-13) auto-grant consent.
  const isGuardian = target?.coppa_consent_parent_id === actorId
  const canBootstrap = !target?.coppa_consent_parent_id && actorRole === 'parent'
  if (!isGuardian && !canBootstrap) {
    return {
      allowed: false, status: 403, code: 'coppa_not_guardian',
      error: 'Only this child’s consenting parent can change their birthdate. Ask them, or contact support.',
    }
  }

  return { allowed: true, parentEditing: true }
}

/**
 * Verifiable-parental-consent binding for /coppa/complete.
 * The signer must (1) not be the student being approved, (2) not hold a student
 * role, and (3) be signed in as EXACTLY the email the consent request was sent to
 * — that email match is what makes the consent verifiable.
 * Returns { ok:true } or { ok:false, code } with codes the page maps to copy:
 * 'student_account' | 'self_consent' | 'email_mismatch'.
 */
export function validateConsentBinding({ signerId, signerEmail, signerRole, pending }) {
  if (signerRole === 'student') return { ok: false, code: 'student_account' }
  if (signerId === pending?.student_id) return { ok: false, code: 'self_consent' }

  const signer = (signerEmail ?? '').toLowerCase().trim()
  const invited = (pending?.parent_email ?? '').toLowerCase().trim()
  if (!signer || signer !== invited) return { ok: false, code: 'email_mismatch' }

  return { ok: true }
}

/**
 * Practical email shape check (one non-space local part, @, dot-separated domain).
 * Deliberately permissive — the real verification is the OAuth sign-in binding —
 * but strict enough to reject junk that `includes('@')` waves through.
 */
export function isValidEmail(email) {
  return typeof email === 'string'
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

/**
 * Consent/invite tokens are DB-generated `encode(gen_random_bytes(24),'hex')` —
 * 48 lowercase hex chars. Validate the shape before a token is composed into a
 * redirect or URL so a crafted value can't ride along.
 */
export function isValidConsentToken(token) {
  return typeof token === 'string' && /^[a-f0-9]{32,64}$/i.test(token)
}

/**
 * Escape a string for interpolation into HTML (email bodies). full_name is
 * client-writable, so any email that embeds it must escape it or a student can
 * inject markup into a trusted consent email.
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
