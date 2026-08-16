// Presence: how we decide someone is "here", and how we say it.
//
// Request-driven presence (the middleware stamp) can only observe REQUESTS, and a
// student reading a coaching page makes none — Baron's row read 55 minutes stale
// while he sat in front of it. A visibility-gated heartbeat closes that gap.
//
// Three separate dials, which is what keeps "chatty" from being a real cost:
//   PING     — how often the browser speaks (cheap, no DB)
//   COALESCE — how often that turns into a WRITE (the only expensive part)
//   ACTIVE   — how coarse the UI is, which must be WIDER than COALESCE so normal
//              write lag is invisible rather than looking like staleness

export const PING_MS = 60_000        // heartbeat while visible + not idle
export const IDLE_MS = 10 * 60_000   // no input this long → stop pinging
export const COALESCE_MS = 2 * 60_000 // server writes at most this often per user
export const ACTIVE_MS = 5 * 60_000  // "Active now" window (> COALESCE by design)

// Should the client send a heartbeat right now?
// Gated on BOTH tab visibility and recent input: an abandoned open tab must not
// report presence forever, which is the classic naive-heartbeat failure where
// everyone looks permanently online.
export function shouldPing({ visible, lastInputAt, lastPingAt, now = Date.now() }) {
  if (!visible) return false
  if (!Number.isFinite(lastInputAt) || now - lastInputAt > IDLE_MS) return false
  if (Number.isFinite(lastPingAt) && now - lastPingAt < PING_MS) return false
  return true
}

// Has this user been seen recently enough to call them present?
export function isActiveNow(lastSeenAt, now = Date.now()) {
  if (!lastSeenAt) return false
  const t = new Date(lastSeenAt).getTime()
  return Number.isFinite(t) && now - t <= ACTIVE_MS
}

// How the roster says it. Buckets deliberately coarser than the write cadence:
// showing an exact "52 min" makes ordinary lag look like a bug, where "Active now"
// absorbs it. Anything past a week falls back to a date.
export function presenceLabel(lastSeenAt, now = Date.now()) {
  if (!lastSeenAt) return '—'
  const t = new Date(lastSeenAt).getTime()
  if (!Number.isFinite(t)) return '—'
  const delta = now - t
  if (delta < 0) return 'Active now'           // clock skew — never show the future
  if (delta <= ACTIVE_MS) return 'Active now'
  const min = Math.floor(delta / 60_000)
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d ago`
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
