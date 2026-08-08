// lib/dates.js — human date labels for lists.
//
// PURE brain (no React) so the rules are unit-testable — same split as lib/requirements.js.
//
// ── Why a bare weekday is wrong (2026-08-04) ─────────────────────────────────────────
// The assignment list showed "WED, 1:44 pm" for anything under 7 days old. On a Tuesday,
// last Wednesday renders as "WED" — which every reader takes to mean THIS Wednesday, i.e.
// tomorrow. The list was sorted correctly (Aug 4 above Jul 29) but LOOKED mis-sorted,
// because a weekday above a weekday implies an order the labels don't actually carry.
//
// So: only "Today" and "Yesterday" are unambiguous without a date. Everything else gets
// WEEKDAY + DATE ("Wed Jul 29") — Robert's call, and the right one: the weekday is the
// part people actually recall, the date is the part that stops it meaning two things.

const MS_DAY = 86400000

// Calendar days apart in LOCAL time — not elapsed hours. 11pm yesterday is "Yesterday"
// even though it is under 24 hours ago, and 1am today is "Today" even though the previous
// entry may be nearer in absolute time. Elapsed-time arithmetic gets both of those wrong.
export function calendarDaysAgo(date, now = new Date()) {
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOf(now) - startOf(date)) / MS_DAY)
}

/**
 * "Today, 2:41 pm" · "Yesterday, 8:56 pm" · "Wed Jul 29, 1:44 pm"
 *
 * Deliberately no bare weekday: see the note above. A future date (clock skew) falls
 * through to the dated form rather than claiming "Today".
 */
export function formatLastModified(dateStr, now = new Date()) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  const days = calendarDaysAgo(date, now)
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  const day = date.toLocaleDateString('en-US', { weekday: 'short' })
  return `${day} ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}
