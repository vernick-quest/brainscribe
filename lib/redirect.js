// lib/redirect.js — open-redirect guard for OAuth `next` handling.
//
// Extracted verbatim (behavior-preserving) from app/api/auth/callback/route.js so
// the rule can be unit-tested in one place. A `next` redirect target must be a
// LOCAL path only: a single leading '/'. Reject '//evil.com' and '/\evil.com'
// (protocol-relative / backslash tricks browsers normalize to off-site), any
// non-'/'-prefixed or absolute URL, and null/empty — all fall back to the default.
export function safeNextPath(rawNext, fallback = '/folder') {
  return (
    typeof rawNext === 'string' &&
    rawNext.startsWith('/') &&
    !rawNext.startsWith('//') &&
    !rawNext.startsWith('/\\')
  )
    ? rawNext
    : fallback
}
