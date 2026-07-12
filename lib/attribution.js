// lib/attribution.js — first-touch signup attribution (bs_attribution cookie → profiles.signup_attribution).
//
// PRIVACY RAIL (non-negotiable): channel/UTM only — the 5 whitelisted utm_* keys,
// nothing else, ever. The whitelist below enforces this even against a tampered
// cookie (extra keys like `email`, `role`, `__proto__` are simply never copied).
// Never PII in the cookie, the column, or any URL.
//
// This module is deliberately PURE and import-free: the callback calls it, and
// scripts/verify/attribution-parse.mjs loads this exact source against a fixture
// table (Gate 1 of the handoff contract), so what's verified is what ships.

export const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

/**
 * Parse the raw `bs_attribution` cookie value (encodeURIComponent'd JSON) into a
 * clean attribution object, or null if nothing usable survives.
 * Whitelist-only keys, string-only values, re-capped at 120 chars (the writer
 * caps too, but never trust a client cookie's discipline).
 */
export function parseAttributionCookie(raw) {
  try {
    const obj = JSON.parse(decodeURIComponent(raw))
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
    const out = {}
    for (const k of ATTRIBUTION_KEYS) {              // WHITELIST — ignore any other key
      const v = obj[k]
      if (typeof v === 'string' && v) out[k] = v.slice(0, 120) // re-cap length defensively
    }
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

/**
 * Set-once decision: the attribution object to persist for this login, or null.
 * Captures ONLY when profiles.signup_attribution is exactly NULL — i.e. the
 * column exists (it's absent/undefined until migration 033 is applied, or when
 * the callback degraded to the legacy select) and no first-touch value has ever
 * been written. A later login can therefore never overwrite first-touch.
 */
export function attributionToCapture(profile, rawCookie) {
  if (!profile || profile.signup_attribution !== null) return null
  if (!rawCookie) return null
  return parseAttributionCookie(rawCookie)
}
