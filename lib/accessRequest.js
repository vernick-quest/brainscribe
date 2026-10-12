// lib/accessRequest.js — "No code? Ask for one" on the /welcome code step.
//
// ── The gap this closes ──────────────────────────────────────────────────────────────
// The owner hears about someone in exactly two places: a waitlist request
// (/api/subscribe) and a role confirmation (/api/profile/confirm-role). A 13+ person who
// signs in with Google and has NO code stops at the code step — BEFORE the role picker —
// so neither fires. Unless they separately found the waitlist form, the owner never
// learns they exist. This lets them ask from where they are stuck.
//
// ── What it deliberately reuses ──────────────────────────────────────────────────────
// The request is a `subscribers` row, exactly like the landing-page form, so it lands in
// the SAME admin queue (/admin → Tools → waitlist, classified `locked_out` / "No code"
// by lib/waitlist.js) and the SAME notification path (notifyOnSubscribe in
// lib/accessAlerts.js: requester ack + admin alert). There is no second notifier.
//
// ── What it does NOT reuse: the email ────────────────────────────────────────────────
// /api/subscribe takes the address from the request body, because the person filling in
// the landing form is anonymous. Here they are SIGNED IN, so the address is the
// session's — resolved on the server, never read from the body. A body-supplied email
// would let any signed-in account file requests (and trigger acknowledgment mail) on
// behalf of any address.
//
// ── COPPA ────────────────────────────────────────────────────────────────────────────
// Under-13 signup is a deliberate dead end (parent-first, migration 055). The button is
// only rendered on the 13+ code step, but a hidden button is not a control: the server
// refuses any COPPA-protected account (sticky — isCoppaProtected), any account whose
// stored birthdate derives under-13, and any request that does not carry the same 13+
// assertion the UI just made. The 13+ answer is not persisted until the role picker (the
// age gate is unchanged by this feature), so the assertion is required explicitly rather
// than inferred from a null age_bracket.
//
// Everything here takes its I/O as arguments, so every branch is unit-tested.

import { isCoppaProtected, deriveAgeBracket } from './coppa.js'
import { isAccessRequest } from './waitlist.js'

/** The `subscribers.source` for a request made from the /welcome code step. */
export const WELCOME_REQUEST_SOURCE = 'welcome'

/**
 * PURE: may this signed-in account file an access request?
 *
 * @param profile        the caller's own profiles row (read server-side, service role)
 * @param assertedBracket the age answer the client says it just gave — must be '13plus'
 * @param now            clock injection for the birthdate check
 * @returns {{ ok: true } | { ok: false, status: number, code: string, error: string }}
 *
 * Order matters: COPPA is checked before anything that could answer more helpfully, so
 * no other branch can ever be what a protected account sees.
 */
export function evaluateAccessRequest({ profile, assertedBracket, now = new Date() } = {}) {
  if (!profile) {
    return { ok: false, status: 409, code: 'no_profile', error: 'We could not find your account. Please sign out and back in.' }
  }

  if (isCoppaProtected(profile) || birthdateIsUnder13(profile.birthdate, now)) {
    return {
      ok: false, status: 403, code: 'coppa_protected',
      error: 'This account is registered as under 13, so a parent or guardian sets it up.',
    }
  }

  if (assertedBracket !== '13plus') {
    return { ok: false, status: 400, code: 'age_required', error: 'Please answer the age question first.' }
  }

  // Admins are never on a waitlist; nothing to request.
  if (profile.role === 'admin') {
    return { ok: false, status: 400, code: 'admin', error: 'Admins do not need a code.' }
  }

  if (profile.access_granted === true) {
    return { ok: false, status: 200, code: 'already_has_access', error: null }
  }

  return { ok: true }
}

function birthdateIsUnder13(birthdate, now) {
  if (!birthdate) return false
  const d = new Date(birthdate)
  if (Number.isNaN(d.getTime())) return false
  return deriveAgeBracket(d, now) === 'under13'
}

/**
 * Record the request — at most ONE "this is new" verdict per address, ever, however many
 * times or however concurrently it is tapped. That verdict is what gates the admin alert,
 * so it is the de-duplication.
 *
 *   1. INSERT … ON CONFLICT DO NOTHING, returning rows (the /api/subscribe pattern): a row
 *      back means THIS call created it.
 *   2. Nothing back → the address is already on the list. Read it:
 *      • an access request (waitlist / landing / welcome) → already asked; the owner was
 *        told then. No new alert.
 *      • a BLOG row → they signed up for posts, never asked for access, so the owner has
 *        never heard they want in. Without this branch the tap would be a silent no-op —
 *        exactly the silence this feature exists to end. The row's source is flipped with
 *        a CONDITIONAL update (`where source = <what we read>`), so of two concurrent taps
 *        only one gets a row back. Cost, accepted and stated: one row per address means a
 *        blog subscriber who asks for access stops being a blog-mail recipient
 *        (lib/blogMail.js mails source='blog' only).
 *
 * @param service a SERVICE-ROLE client (subscribers has no client write policy, 044)
 * @param email   the SESSION's address — never a request-body value
 * @returns {{ ok: boolean, outcome: 'requested'|'already_requested'|'already_invited'|'failed', inserted?: object[] }}
 *   `inserted` is non-empty ONLY for 'requested' — hand it straight to notifyOnSubscribe.
 */
export async function recordAccessRequest(service, email) {
  const addr = String(email ?? '').trim().toLowerCase()
  if (!addr) return { ok: false, outcome: 'failed', reason: 'no_email' }

  const { data: inserted, error } = await service
    .from('subscribers')
    .upsert({ email: addr, source: WELCOME_REQUEST_SOURCE }, { onConflict: 'email', ignoreDuplicates: true })
    .select('email')
  if (error) {
    console.error('[access request] insert FAILED — no request recorded, no alert:', addr, error.message)
    return { ok: false, outcome: 'failed', reason: 'insert_failed' }
  }
  if (inserted?.length) return { ok: true, outcome: 'requested', inserted }

  // Already on the list. Which kind of row is it?
  const { data: row, error: readErr } = await service
    .from('subscribers')
    .select('email, source, invited_at, dismissed_at')
    .eq('email', addr)
    .maybeSingle()
  if (readErr || !row) {
    // We KNOW a row exists (the insert conflicted) but cannot tell what it is. Say so
    // loudly rather than guess: if it is a blog row, the owner has NOT been told.
    console.error('[access request] existing row unreadable — cannot tell whether the owner was ever alerted:', addr, readErr?.message ?? 'no row')
    return { ok: false, outcome: 'failed', reason: 'existing_unreadable' }
  }

  if (!isAccessRequest(row)) {
    let q = service.from('subscribers').update({ source: WELCOME_REQUEST_SOURCE }).eq('email', addr)
    q = row.source == null ? q.is('source', null) : q.eq('source', row.source)
    const { data: flipped, error: flipErr } = await q.select('email')
    if (flipErr) {
      console.error('[access request] could not convert a blog row into an access request — owner NOT alerted:', addr, flipErr.message)
      return { ok: false, outcome: 'failed', reason: 'convert_failed' }
    }
    // Zero rows = a concurrent tap converted it first and alerted for it.
    if (flipped?.length) return { ok: true, outcome: 'requested', inserted: flipped }
    return { ok: true, outcome: 'already_requested' }
  }

  // A code already went out (and the admin did not later dismiss) — point them at it
  // rather than implying a fresh request is pending.
  if (row.invited_at && !row.dismissed_at) return { ok: true, outcome: 'already_invited' }

  // Includes a DISMISSED row: the owner saw this address and decided. Re-asking does not
  // override that, but it is not silent either.
  if (row.dismissed_at) {
    console.warn('[access request] re-request from a DISMISSED address — not re-alerting:', addr)
  }
  return { ok: true, outcome: 'already_requested' }
}
