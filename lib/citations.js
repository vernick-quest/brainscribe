// lib/citations.js — Research & Citations v1: DETERMINISTIC bibliography formatter.
//
// PURE (no Next/Supabase/network imports) so the exact formatter we ship also runs
// in scripts/verify/citations.mjs — same pattern as lib/provenance.js. NO model at
// runtime: given structured citation fields, produce an MLA-9 / APA-7 string.
//
// We store STRUCTURED FIELDS, never formatted strings (spec Pillar 3), so the same
// source re-renders in either style and a field edit reflows the citation. Fields:
//   { title, author, publisher, publishedDate, url, accessedDate }
// All optional except that an empty source yields an empty citation. `publishedDate`
// and `accessedDate` accept 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY' | '' (freeform text is
// tolerated but only ISO-ish prefixes are parsed into day/month/year).
//
// Returns { plain, segments }:
//   plain    — the flat citation string (italics dropped) for clipboard / plain export.
//   segments — [{ text, italic }] so the Works Cited card can render the container /
//              title in italics WITHOUT us building HTML from user-supplied fields
//              (React escapes each segment's text → no injection surface).

const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July',
  'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']
const APA_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

// Personal-name → surname-first inversion is only safe for clear personal names.
// Org/site authors ("National Geographic Society", "NASA") must pass through
// untouched — inverting them ("Society, National Geographic") is wrong.
const ORG_HINTS = /\b(society|institute|association|department|university|college|foundation|company|corporation|inc|llc|ltd|news|press|magazine|channel|network|museum|agency|administration|bureau|commission|council|committee|team|staff|editors?|group|organization|org|gov|nasa|cdc|who|nato|bbc|cnn|npr|pbs)\b/i

function isProbablyPerson(name) {
  const tokens = name.trim().split(/\s+/)
  if (tokens.length < 2 || tokens.length > 4) return false     // "Cher" / long org names
  if (ORG_HINTS.test(name)) return false
  if (/[.,&/]/.test(name)) return false                        // "Smith, J." / "A & B" / already-formatted
  if (/\b(and|et al)\b/i.test(name)) return false              // multi-author list — leave as typed
  return true
}

// "Alex Kenzie" -> { last:'Kenzie', firsts:['Alex'] }
function splitPersonName(name) {
  const tokens = name.trim().split(/\s+/)
  return { last: tokens[tokens.length - 1], firsts: tokens.slice(0, -1) }
}

// Parse an ISO-ish date prefix into parts. Returns { year, month, day } with month
// 1-based, any of which may be null. Non-ISO freeform → { year:null,... } (we don't
// guess). '2021-03-12' -> {2021,3,12}; '2021-03' -> {2021,3,null}; '2021' -> {2021,null,null}.
function parseDateParts(value) {
  const s = String(value || '').trim()
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(s)
  if (!m) return { year: null, month: null, day: null }
  const year = Number(m[1])
  const month = m[2] ? Number(m[2]) : null
  const day = m[3] ? Number(m[3]) : null
  return {
    year: year || null,
    month: month >= 1 && month <= 12 ? month : null,
    day: day >= 1 && day <= 31 ? day : null,
  }
}

// MLA date: "12 Mar. 2021" | "Mar. 2021" | "2021" | '' (empty when no year).
function mlaDate({ year, month, day }) {
  if (!year) return ''
  const mo = month ? MLA_MONTHS[month - 1] : ''
  if (day && month) return `${day} ${mo} ${year}`
  if (month) return `${mo} ${year}`
  return `${year}`
}

// APA date parenthetical content: "2021, March 12" | "2021, March" | "2021" | "n.d.".
function apaDate({ year, month, day }) {
  if (!year) return 'n.d.'
  const mo = month ? APA_MONTHS[month - 1] : ''
  if (day && month) return `${year}, ${mo} ${day}`
  if (month) return `${year}, ${mo}`
  return `${year}`
}

// MLA drops the URL scheme (and a leading www is kept, per MLA 9 examples using the host).
function mlaUrl(url) {
  return String(url || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

function ensurePeriod(s) {
  const t = s.trim()
  if (!t) return ''
  return /[.!?]$/.test(t) ? t : t + '.'
}

// Push a text segment, coalescing with the previous same-italic segment for tidy plain output.
function pushSeg(segs, text, italic = false) {
  if (!text) return
  const prev = segs[segs.length - 1]
  if (prev && prev.italic === italic) prev.text += text
  else segs.push({ text, italic })
}

function toResult(segments) {
  // Trim leading/trailing whitespace across the flattened string.
  const plain = segments.map(s => s.text).join('').replace(/\s+/g, ' ').trim()
  return { plain, segments }
}

// ── MLA 9 ────────────────────────────────────────────────────────────────────
// Author Last, First. "Title." *Container*, Date, URL. Accessed Date.
function formatMLA(src) {
  const segs = []
  const title = (src.title || '').trim()
  const author = (src.author || '').trim()
  const container = (src.publisher || '').trim()
  const date = mlaDate(parseDateParts(src.publishedDate))
  const url = mlaUrl(src.url)
  const accessed = mlaDate(parseDateParts(src.accessedDate))

  if (author) {
    if (isProbablyPerson(author)) {
      const { last, firsts } = splitPersonName(author)
      pushSeg(segs, `${last}, ${firsts.join(' ')}. `)
    } else {
      pushSeg(segs, ensurePeriod(author) + ' ')
    }
  }
  if (title) pushSeg(segs, `“${title.replace(/[."]+$/, '')}.” `)
  if (container) pushSeg(segs, container, true)

  // Comma-join the trailing container/date/url run, then end with a period.
  const tail = []
  if (date) tail.push(date)
  if (url) tail.push(url)
  if (container && tail.length) pushSeg(segs, ', ')
  else if (container) pushSeg(segs, '')
  pushSeg(segs, tail.join(', '))
  if (container || tail.length) pushSeg(segs, '. ')

  if (accessed) pushSeg(segs, `Accessed ${accessed}.`)
  return toResult(segs)
}

// ── APA 7 ────────────────────────────────────────────────────────────────────
// Author, A. A. (Year, Month Day). *Title*. Site Name. URL
function formatAPA(src) {
  const segs = []
  const title = (src.title || '').trim().replace(/[.]+$/, '')
  const author = (src.author || '').trim()
  const site = (src.publisher || '').trim()
  const date = apaDate(parseDateParts(src.publishedDate))
  const url = (src.url || '').trim().replace(/\/+$/, '')

  if (author) {
    if (isProbablyPerson(author)) {
      const { last, firsts } = splitPersonName(author)
      const initials = firsts.map(f => f[0].toUpperCase() + '.').join(' ')
      pushSeg(segs, `${last}, ${initials} `)
    } else {
      pushSeg(segs, ensurePeriod(author) + ' ')
    }
  }
  pushSeg(segs, `(${date}). `)
  if (title) { pushSeg(segs, title, true); pushSeg(segs, '. ') }
  // APA: omit the site name when it duplicates a group author (avoids "NASA. NASA.").
  if (site && site.toLowerCase() !== author.toLowerCase()) pushSeg(segs, ensurePeriod(site) + ' ')
  if (url) pushSeg(segs, url)
  return toResult(segs)
}

export const CITATION_STYLES = ['mla', 'apa']
export const DEFAULT_STYLE = 'mla'

// formatCitation(source, style) -> { plain, segments }
export function formatCitation(source = {}, style = DEFAULT_STYLE) {
  return style === 'apa' ? formatAPA(source) : formatMLA(source)
}

// A "Works Cited" (MLA) / "References" (APA) list: alphabetized by the citation's
// leading text (author surname or title when authorless), the academic convention.
export function formatBibliography(sources = [], style = DEFAULT_STYLE) {
  const entries = (sources ?? [])
    .map(s => formatCitation(s, style))
    .filter(e => e.plain)
    .sort((a, b) => a.plain.localeCompare(b.plain, 'en', { sensitivity: 'base' }))
  return {
    heading: style === 'apa' ? 'References' : 'Works Cited',
    entries,
    plain: entries.map(e => e.plain).join('\n'),
  }
}
