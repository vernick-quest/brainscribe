// lib/ssrf.js — SSRF guardrails for server-side URL metadata fetching.
//
// PURE classification helpers (no network/Next imports) so scripts/verify/ssrf.mjs
// exercises the exact rules the /api/source-metadata route enforces. This is
// BrainScribe's FIRST server-side fetch of arbitrary student-supplied URLs (spec
// Pillar 3), so the classification MUST be conservative: deny by default.
//
// Defense layers (the route wires these together):
//   1. isDisallowedUrl()  — scheme allowlist, no credentials, no localhost/.internal,
//                           reject private IP LITERALS in the host.
//   2. classifyIp()       — every DNS-resolved address is checked; a private/reserved
//                           address (v4 or v4-mapped/private v6) aborts the fetch.
//   3. the route re-runs BOTH on every redirect hop (post-redirect revalidation) and
//      pins the socket to the validated IP (closes the DNS-rebinding TOCTOU).

// ── IPv4 ─────────────────────────────────────────────────────────────────────
export function parseIpv4(str) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(str).trim())
  if (!m) return null
  const octets = m.slice(1).map(Number)
  if (octets.some(o => o < 0 || o > 255)) return null
  return octets
}

// True for any IPv4 address that must never be fetched: private, loopback,
// link-local, CGNAT, reserved, multicast, broadcast, and the cloud metadata IP.
export function isPrivateIpv4(octets) {
  const [a, b] = octets
  if (a === 0) return true                                   // 0.0.0.0/8 "this host"
  if (a === 10) return true                                  // private
  if (a === 127) return true                                 // loopback
  if (a === 169 && b === 254) return true                    // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true           // private
  if (a === 192 && b === 168) return true                    // private
  if (a === 100 && b >= 64 && b <= 127) return true          // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0 && octets[2] === 0) return true   // 192.0.0.0/24 IETF
  if (a === 192 && b === 0 && octets[2] === 2) return true   // 192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true       // 198.18.0.0/15 benchmark
  if (a === 198 && b === 51 && octets[2] === 100) return true// 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && octets[2] === 113) return true // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true                                  // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.*
  return false
}

// ── IPv6 (pragmatic prefix classification; v4-mapped handled exactly) ──────────
// Returns true for loopback, unspecified, ULA (fc00::/7), link-local (fe80::/10),
// and IPv4-mapped/-compatible addresses whose embedded v4 is private. Public
// global-unicast v6 passes. (Full v6 range coverage is a documented best-effort —
// flagged for the conductor's security pass.)
export function isPrivateIpv6(str) {
  let s = String(str).trim().toLowerCase()
  // strip zone id / brackets
  s = s.replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  if (s === '::1' || s === '::') return true
  // IPv4-mapped (::ffff:1.2.3.4) or -compatible / embedded — extract trailing v4.
  const v4tail = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s)
  if (v4tail && (s.startsWith('::ffff:') || s.startsWith('::') || s.includes(':ffff:'))) {
    const oct = parseIpv4(v4tail[1])
    if (oct) return isPrivateIpv4(oct)
  }
  const head = s.split(':')[0]
  if (/^f[cd]/.test(head)) return true                       // fc00::/7 unique-local
  if (/^fe[89ab]/.test(head)) return true                    // fe80::/10 link-local
  return false
}

// classifyIp(ip, family?) -> { private: bool }. family from net.isIP (4|6) or inferred.
export function classifyIp(ip, family) {
  const fam = family || (parseIpv4(ip) ? 4 : 6)
  if (fam === 4) {
    const oct = parseIpv4(ip)
    return { private: !oct || isPrivateIpv4(oct) }           // unparseable → treat as unsafe
  }
  return { private: isPrivateIpv6(ip) }
}

const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.localhost']
const BLOCKED_HOSTS = new Set(['localhost', 'metadata', 'metadata.google.internal'])

// isDisallowedUrl(urlStr) -> null if allowed, else a short reason string.
// First-line defense on the raw URL, BEFORE any DNS resolution.
export function isDisallowedUrl(urlStr) {
  let u
  try { u = new URL(String(urlStr)) } catch { return 'unparseable-url' }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'scheme-not-http'
  if (u.username || u.password) return 'url-credentials'      // http://user:pass@… SSRF trick
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return 'empty-host'
  if (BLOCKED_HOSTS.has(host)) return 'blocked-host'
  if (BLOCKED_HOST_SUFFIXES.some(suf => host.endsWith(suf))) return 'blocked-host-suffix'
  // Host is a raw IP literal → classify it directly (bracketed v6 hostname arrives w/o brackets).
  const v4 = parseIpv4(host)
  if (v4) return isPrivateIpv4(v4) ? 'private-ip-literal' : null
  if (host.includes(':')) return isPrivateIpv6(host) ? 'private-ip-literal' : null
  return null
}

// Strip query/fragment + userinfo before STORING a source URL — a citation needs the
// canonical page, and query strings routinely carry tracking tokens / session PII
// (spec: strip PII/tokens from stored URLs). Keeps scheme+host+path only.
export function canonicalizeStoredUrl(urlStr) {
  try {
    const u = new URL(String(urlStr))
    u.search = ''
    u.hash = ''
    u.username = ''
    u.password = ''
    return u.toString()
  } catch { return String(urlStr || '') }
}
