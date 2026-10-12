// lib/accessAlerts.js — tell the ADMIN when someone asks to get in, or gets in.
//
// Product owner, 2026-10-11: "Right now, I have no notification if someone requested
// to use the app." Measured: someone asked on 2026-09-02 and he heard nothing for 19+
// days. /api/subscribe had been fixed once already for "told nobody, in either
// direction" — and the fix built only ONE direction (an ack to the requester).
//
// Everything here is either PURE or takes its I/O as injected arguments (a Supabase
// service client, a `send` function), so the decision of whether an alert fires — and
// the case where it silently can't — is unit-tested without a DB or a mailbox.
//
// 🔴 The failure this file exists to prevent is SILENCE, and silence has no symptom.
// So every path that ends without an alert going out logs with console.error and
// returns a reason; none of them returns quietly.

import { isAccessRequest } from './waitlist.js'
import { isCoppaProtected } from './coppa.js'

export const PACIFIC_TZ = 'America/Los_Angeles'

/**
 * "Wed, Sep 2, 2026, 3:14 PM PDT". The owner reads Pacific — a UTC stamp at 9:30 is
 * 2:30am to him, and an alert is read once, at a glance. The zone name is printed so
 * the reading is never ambiguous across the DST switch.
 */
export function formatPacific(when) {
  const d = when instanceof Date ? when : new Date(when)
  if (Number.isNaN(d.getTime())) return 'unknown time'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(d)
}

/** Lowercased, trimmed, de-duplicated, non-empty admin addresses. */
export function adminRecipients(rows) {
  const out = []
  for (const r of rows ?? []) {
    const e = String(r?.email ?? '').trim().toLowerCase()
    if (e && !out.includes(e)) out.push(e)
  }
  return out
}

/**
 * Escape a literal for a LIKE/ILIKE pattern so `_` and `%` in an address match only
 * themselves. (`first_last@x.com` would otherwise also match `firstXlast@x.com`.)
 * Callers still confirm an exact lowercased match in JS — see findAccountByEmail.
 */
export function escapeLikePattern(s) {
  return String(s ?? '').replace(/[\\%_]/g, '\\$&')
}

/**
 * Index profiles by lowercased email. `.in('email', …)` is an EXACT match, and a
 * profile email comes from Google, not from our lowercasing form — the retention cron
 * already hit this (app/api/cron/coppa-cleanup). Matching in JS removes the dependency
 * on the data happening to be normalized.
 */
export function indexAccountsByEmail(profiles) {
  const out = {}
  for (const p of profiles ?? []) {
    const e = String(p?.email ?? '').trim().toLowerCase()
    if (e && !out[e]) out[e] = p
  }
  return out
}

/**
 * Case-insensitive lookup of ONE profile by email.
 * @returns {{ ok: boolean, account: object|null }} — ok:false means we could NOT tell,
 *   which the alert must say out loud rather than rendering as "no account".
 */
export async function findAccountByEmail(service, email) {
  const addr = String(email ?? '').trim().toLowerCase()
  if (!addr) return { ok: true, account: null }
  try {
    const { data, error } = await service
      .from('profiles')
      .select('email, role, access_granted, access_code_used, age_bracket, coppa_consent_required, created_at')
      .ilike('email', escapeLikePattern(addr))
    if (error) {
      console.error('[access alerts] account lookup failed:', error.message)
      return { ok: false, account: null }
    }
    // ILIKE narrows; the exact lowercased compare decides. PostgREST also treats `*`
    // as a wildcard, so the candidate set can be wider than the address.
    const account = (data ?? []).find(p => String(p.email ?? '').trim().toLowerCase() === addr) ?? null
    return { ok: true, account }
  } catch (e) {
    console.error('[access alerts] account lookup threw:', e?.message ?? e)
    return { ok: false, account: null }
  }
}

function siteUrlOr(siteUrl) {
  return String(siteUrl || 'https://www.brainscribe.io').replace(/\/+$/, '')
}

/** One line describing what an address's account (if any) means for the admin. */
export function describeAccount(lookup) {
  if (!lookup?.ok) {
    return 'UNKNOWN — the account lookup failed. Check /admin before acting on this.'
  }
  const a = lookup.account
  if (!a) return 'None yet. They are waiting on you.'
  const role = a.role ?? 'unknown role'
  const code = a.access_code_used ? `joined with code "${a.access_code_used}"` : 'no code recorded'
  if (a.access_granted === true) {
    return `Already has a ${role} account with access (${code}). Probably no action needed.`
  }
  if (isCoppaProtected(a)) {
    return `Has a ${role} account registered as UNDER 13 — held for a parent, not for a code.`
  }
  return `Has a ${role} account but NO access yet (${code}) — stuck at the code screen. Send them a code.`
}

/**
 * Should a /api/subscribe call alert the admin?
 * Only a GENUINELY NEW row (the upsert's `.select()` returns inserted rows only, so a
 * re-submit comes back empty) whose source is an access request. A blog subscriber is
 * not asking to use the app.
 */
export function shouldAlertAccessRequest({ inserted, source }) {
  return Array.isArray(inserted) && inserted.length > 0 && isAccessRequest({ source })
}

// Sources whose requester gets the "we got your request" acknowledgment. Not 'landing'
// (unchanged from before). 'welcome' is a signed-in 13+ person who tapped "No code? Ask
// for one", and the ack is the only written confirmation they get that it went anywhere.
export const ACK_SOURCES = new Set(['waitlist', 'welcome'])

// How the alert names where a request came from. The owner reads it once, at a glance.
const SOURCE_LABEL = {
  welcome: 'the code screen after sign-in ("No code? Ask for one")',
}
export function describeSource(source) {
  if (!source) return 'unknown form'
  return SOURCE_LABEL[source] ?? `${source} form`
}

// 🔴 Everything in an alert body is written to survive being QUOTED. Reply-To is the
// person the alert is about, so when the owner hits Reply, Gmail quotes this text under
// his message and the requester reads it. Informative for him, fine for them.
const ACK_LINE = {
  sent: 'Sent — they got our automatic "we got your request" email.',
  failed: 'Not delivered — our automatic "we got your request" email did not go out, so a reply from you is the first they will hear from us.',
  not_applicable: 'None — this form sends no automatic confirmation, so a reply from you is the first they will hear from us.',
}

/**
 * Who should the owner's Reply reach, and the line that tells him so?
 *
 * The person the alert is about — EXCEPT when that person may be under 13. Replying
 * would put the owner in direct email contact with a child (with a code a child must
 * never be handed: under-13 is parent-first). So a COPPA-protected account, or one we
 * could not check, keeps replies on BrainScribe's own inbox and says why.
 *
 * @param mayBeChild true when the account is protected OR its state is unknown
 * @returns {{ replyTo: string|null, line: string }} — replyTo null = sender's default
 */
export function alertReplyTarget({ email, mayBeChild }) {
  const addr = String(email ?? '').trim().toLowerCase()
  if (!addr) return { replyTo: null, line: 'Replying to this email reaches BrainScribe, not the person — there is no address to reply to.' }
  if (mayBeChild) {
    return {
      replyTo: null,
      line: `Replying to this email does NOT reach ${addr} — this may be an under-13 account, which a parent sets up. Check /admin first.`,
    }
  }
  return { replyTo: addr, line: `Reply to this email to answer them directly — your reply goes to ${addr}, not to BrainScribe.` }
}

/** Subject + plain-text body for a new access request. */
export function buildAccessRequestAlert({ email, source, at, lookup, ack = 'not_applicable', siteUrl }) {
  const already = lookup?.ok && lookup.account?.access_granted === true
  const subject = already
    ? `BrainScribe: access request from ${email} (already has an account)`
    : `BrainScribe: new access request from ${email}`
  // A failed lookup could be anyone, including a child — don't route the reply to them.
  const mayBeChild = !lookup?.ok || isCoppaProtected(lookup.account)
  const { replyTo, line } = alertReplyTarget({ email, mayBeChild })
  const text = [
    line,
    '',
    'Someone just asked for access to BrainScribe.',
    '',
    `Email:    ${email}`,
    `When:     ${formatPacific(at)}`,
    `Source:   ${describeSource(source)}`,
    `Account:  ${describeAccount(lookup)}`,
    `Receipt:  ${ACK_LINE[ack] ?? ACK_LINE.not_applicable}`,
    '',
    `Or send a code from the admin panel: ${siteUrlOr(siteUrl)}/admin?tab=tools#waitlist`,
    '',
    'You get one of these per address — a re-submit of the same email does not alert again.',
  ].join('\n')
  return { subject, text, replyTo }
}

const ROLE_TAB = { student: 'students', parent: 'parents', teacher: 'teachers' }

/** Subject + plain-text body for a new account finishing signup. */
export function buildNewAccountAlert({ email, role, ageBracket, accessCode, accessGranted, waitlistedAt, at, siteUrl }) {
  const under13 = ageBracket === 'under13'
  const subject = `BrainScribe: new ${under13 ? 'under-13 ' : ''}${role ?? 'account'} signup — ${email}`
  const { replyTo, line } = alertReplyTarget({ email, mayBeChild: under13 })
  const access = accessGranted === true
    ? 'Granted.'
    : accessGranted === undefined
      ? 'UNKNOWN — the profile read failed. Check /admin.'
      : under13
      ? 'Held — under 13. A parent has to create their own account and approve; nothing for you to do.'
      : 'NOT granted — no code was redeemed, so they cannot use the coach yet.'
  const waitlist = waitlistedAt === undefined
    ? 'unknown (lookup failed)'
    : waitlistedAt
      ? `yes — asked ${formatPacific(waitlistedAt)}`
      : 'no'
  const text = [
    line,
    '',
    'A new account just finished signing up on BrainScribe.',
    '',
    `Email:        ${email}`,
    `When:         ${formatPacific(at)}`,
    `Role:         ${role ?? 'unknown'}${under13 ? ' (under 13)' : ''}`,
    `Access code:  ${accessCode || 'none'}`,
    `Access:       ${access}`,
    `On waitlist:  ${waitlist}`,
    '',
    `See them in the admin panel: ${siteUrlOr(siteUrl)}/admin?tab=${ROLE_TAB[role] ?? 'students'}`,
    '',
    'Sent once per account, when they first choose a role — not on every sign-in.',
  ].join('\n')
  return { subject, text, replyTo }
}

/**
 * Resolve admin recipients (profiles.role='admin' — the same convention as the access
 * code threshold alert in /api/access/redeem) and send. NEVER silent: zero recipients,
 * a failed lookup, and a failed send each log loudly and return a distinct reason.
 *
 * @param send async ({ to, subject, text, tag, replyTo }) => boolean
 * @param replyTo where the owner's Reply should go (the person the alert is about), or
 *   null for the sender's default (BrainScribe's inbox)
 * @returns {{ sent: boolean, reason: 'sent'|'lookup_failed'|'no_admins'|'send_failed', to?: string[] }}
 */
export async function alertAdmins({ service, subject, text, tag = 'admin alert', send, replyTo = null }) {
  let rows
  try {
    const { data, error } = await service
      .from('profiles').select('email').eq('role', 'admin').not('email', 'is', null)
    if (error) {
      console.error(`[${tag}] admin lookup FAILED — alert NOT sent:`, error.message, '| subject:', subject)
      return { sent: false, reason: 'lookup_failed' }
    }
    rows = data
  } catch (e) {
    console.error(`[${tag}] admin lookup THREW — alert NOT sent:`, e?.message ?? e, '| subject:', subject)
    return { sent: false, reason: 'lookup_failed' }
  }

  const to = adminRecipients(rows)
  if (!to.length) {
    console.error(`[${tag}] ZERO admin recipients (no profile with role='admin' and an email) — alert NOT sent:`, subject)
    return { sent: false, reason: 'no_admins', to }
  }

  let ok = false
  try {
    ok = await send({ to, subject, text, tag, replyTo })
  } catch (e) {
    console.error(`[${tag}] send threw:`, e?.message ?? e)
    ok = false
  }
  if (!ok) {
    console.error(`[${tag}] admin alert NOT sent (Resend error or RESEND_API_KEY unset):`, subject)
    return { sent: false, reason: 'send_failed', to }
  }
  return { sent: true, reason: 'sent', to }
}

/**
 * Everything /api/subscribe does after a successful upsert, in order:
 *   1. acknowledge the requester (ACK_SOURCES only — waitlist, and the /welcome button), then
 *   2. alert the admin, reporting whether step 1 actually landed.
 * The ack goes first so the alert can say it did not go out when it failed —
 * a broken ack path is otherwise a second silent failure.
 *
 * @returns {{ ack: string, alert: string }} — every branch names why.
 */
export async function notifyOnSubscribe({ email, source, inserted, service, sendAck, sendAlert, now = new Date(), siteUrl }) {
  if (!Array.isArray(inserted) || inserted.length === 0) {
    // A re-submit. They were already acked and the admin already alerted the first time.
    return { ack: 'skipped_existing', alert: 'skipped_existing' }
  }

  let ack = 'not_applicable'
  if (ACK_SOURCES.has(source)) {
    let ok = false
    try { ok = await sendAck({ to: email }) } catch (e) { console.error('[subscribe] waitlist ack threw:', e?.message ?? e) }
    ack = ok ? 'sent' : 'failed'
    if (!ok) console.error('[subscribe] waitlist ack NOT sent to', email)
  }

  if (!shouldAlertAccessRequest({ inserted, source })) {
    return { ack, alert: 'not_access_request' }
  }

  const lookup = await findAccountByEmail(service, email)
  const { subject, text, replyTo } = buildAccessRequestAlert({ email, source, at: now, lookup, ack, siteUrl })
  const res = await alertAdmins({ service, subject, text, replyTo, tag: 'access request alert', send: sendAlert })
  return { ack, alert: res.reason }
}

/**
 * Was this address on the waitlist, and when did it ask? `undefined` = could not tell.
 */
export async function findWaitlistRequest(service, email) {
  const addr = String(email ?? '').trim().toLowerCase()
  if (!addr) return null
  try {
    const { data, error } = await service
      .from('subscribers').select('email, source, created_at').eq('email', addr).maybeSingle()
    if (error) {
      console.error('[access alerts] waitlist lookup failed:', error.message)
      return undefined
    }
    return data && isAccessRequest(data) ? data.created_at : null
  } catch (e) {
    console.error('[access alerts] waitlist lookup threw:', e?.message ?? e)
    return undefined
  }
}

/**
 * The new-account alert. The CALLER guarantees once-per-account (confirm-role only
 * calls this when its conditional update is the one that flipped role_confirmed).
 */
export async function notifyNewAccount({ service, email, role, ageBracket, accessCode, accessGranted, sendAlert, now = new Date(), siteUrl }) {
  if (!email) {
    console.error('[new account alert] no email on the account — alert NOT sent for role', role)
    return { alert: 'no_email' }
  }
  const waitlistedAt = await findWaitlistRequest(service, email)
  const { subject, text, replyTo } = buildNewAccountAlert({ email, role, ageBracket, accessCode, accessGranted, waitlistedAt, at: now, siteUrl })
  const res = await alertAdmins({ service, subject, text, replyTo, tag: 'new account alert', send: sendAlert })
  return { alert: res.reason }
}
