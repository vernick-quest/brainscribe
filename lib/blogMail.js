// lib/blogMail.js — who may be mailed a blog post, and the unsubscribe token.
//
// PURE (no Next/Supabase) so both rules are unit-testable. Bulk mail is the one thing
// in this app that reaches many strangers at once; the rules deciding who gets it
// should not live inline in a route handler.
//
// CONTEXT: the blog form has promised "we'll send new posts as they go up" since it
// shipped, and nothing has ever sent one. This is that sender. It is deliberately
// small — an admin mails one published post to the list, by hand.
import { createHmac, timingSafeEqual } from 'node:crypto'

// Only blog-form signups. A waitlist row is somebody asking for ACCESS; mailing them a
// blog post is answering a question they never asked, the same error in the opposite
// direction from the one the waitlist card already guards against.
export const MAILABLE_SOURCES = new Set(['blog'])

/**
 * PURE: may this subscriber row be sent a blog post?
 * Returns a reason on every path so a dry-run can show WHY someone was skipped —
 * "0 recipients" with no explanation is indistinguishable from a broken query.
 */
export function mailDecision(row = {}) {
  const email = String(row.email ?? '').trim().toLowerCase()
  if (!email) return { mail: false, reason: 'no_email' }
  // Suppression outranks everything. Checked first so no later rule can reach someone
  // who has told us to stop.
  if (row.unsubscribed_at) return { mail: false, reason: 'unsubscribed' }
  if (!MAILABLE_SOURCES.has(String(row.source ?? '').toLowerCase())) {
    return { mail: false, reason: 'not_a_blog_subscriber' }
  }
  return { mail: true, reason: 'ok' }
}

export function selectRecipients(rows = []) {
  const recipients = []
  const skipped = {}
  for (const row of rows ?? []) {
    const { mail, reason } = mailDecision(row)
    if (mail) recipients.push(String(row.email).trim().toLowerCase())
    else skipped[reason] = (skipped[reason] ?? 0) + 1
  }
  return { recipients, skipped }
}

// ── Unsubscribe token ────────────────────────────────────────────────────────────
//
// HMAC over the address rather than a stored token: nothing to migrate, nothing to
// leak, and a link works forever without a lookup. The address is already in the URL
// (the recipient's own), so the token's job is only to stop a stranger unsubscribing
// someone else by guessing addresses.
//
// ⚠️ Rotating the secret invalidates every outstanding link. That is survivable — the
// GET page falls back to "email us and we'll remove you", which is the route the
// privacy policy already publishes — but do not rotate casually.
function secret() {
  const s = process.env.UNSUBSCRIBE_SECRET
    ?? process.env.CRON_SECRET
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('no secret available for unsubscribe tokens')
  return s
}

export function unsubscribeToken(email) {
  return createHmac('sha256', secret())
    .update(String(email ?? '').trim().toLowerCase())
    .digest('hex')
    .slice(0, 32)
}

/** Constant-time compare — a token check that leaks timing is a token check that leaks. */
export function verifyUnsubscribeToken(email, token) {
  const expected = unsubscribeToken(email)
  const given = String(token ?? '')
  if (given.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(given))
  } catch {
    return false
  }
}

export function unsubscribeUrl(email, siteUrl) {
  const base = siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.brainscribe.io'
  const e = encodeURIComponent(String(email ?? '').trim().toLowerCase())
  return `${base}/api/unsubscribe?e=${e}&t=${unsubscribeToken(email)}`
}
