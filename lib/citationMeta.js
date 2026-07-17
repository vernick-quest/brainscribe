// lib/citationMeta.js — deterministic HTML → citation metadata extraction.
//
// PURE (no network/Next imports) so scripts/verify/ssrf.mjs tests it against fixture
// HTML. Given a page's HTML + its final URL, pull ONLY structured citation fields:
//   { title, author, publisher, publishedDate, url }
// It NEVER returns page body content (spec Pillar 3: "never render the page's CONTENT
// to the kid — only extracted metadata fields"). Missing fields come back '' — the
// student's confirm card turns those into coached blanks; we never guess.
//
// No DOM library (no external dep on the server) — meta/JSON-LD tags are simple
// enough for careful regex. Precedence: OpenGraph / citation_* meta → JSON-LD →
// <title>. Author/date extraction genuinely fails on ~40–50% of pages; that's why
// the card is always confirm-to-save.

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim()
}

// Parse every <meta> tag into a lookup keyed by its property/name (lowercased).
// Handles either attribute order (property before/after content) and both quote styles.
function metaMap(html) {
  const map = {}
  const metaRE = /<meta\b[^>]*>/gi
  let m
  while ((m = metaRE.exec(html)) !== null) {
    const tag = m[0]
    const key = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)
    const val = /content\s*=\s*["']([^"']*)["']/i.exec(tag)
    if (key && val) {
      const k = key[1].toLowerCase()
      if (!(k in map)) map[k] = decodeEntities(val[1])   // first wins
    }
  }
  return map
}

// Collect JSON-LD blocks; tolerate arrays / @graph / parse failures.
function jsonLdObjects(html) {
  const out = []
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim())
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      for (const o of arr) {
        if (o && Array.isArray(o['@graph'])) out.push(...o['@graph'])
        else if (o) out.push(o)
      }
    } catch { /* malformed JSON-LD is common — skip */ }
  }
  return out
}

function ldName(v) {
  if (!v) return ''
  if (typeof v === 'string') return decodeEntities(v)
  if (Array.isArray(v)) return ldName(v[0])
  if (typeof v === 'object') return decodeEntities(v.name || '')
  return ''
}

function hostPublisher(finalUrl) {
  try { return new URL(finalUrl).hostname.replace(/^www\./, '') } catch { return '' }
}

export function extractCitationMeta(html, finalUrl = '') {
  const meta = metaMap(html)
  const ld = jsonLdObjects(html)
  const article = ld.find(o => {
    const t = o['@type']
    const types = Array.isArray(t) ? t : [t]
    return types.some(x => /article|newsarticle|blogposting|report|webpage/i.test(String(x)))
  }) || ld[0] || {}

  const titleTag = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1]

  const title =
    meta['og:title'] || meta['citation_title'] || meta['twitter:title'] ||
    ldName(article.headline || article.name) ||
    (titleTag ? decodeEntities(titleTag) : '')

  const author =
    meta['citation_author'] || meta['author'] || meta['article:author'] ||
    meta['parsely-author'] || ldName(article.author) || ''

  const publisher =
    meta['og:site_name'] || meta['citation_journal_title'] ||
    ldName(article.publisher) || hostPublisher(finalUrl)

  // Prefer a machine date; keep only the YYYY-MM-DD prefix (formatter parses partials).
  const rawDate =
    meta['article:published_time'] || meta['citation_publication_date'] ||
    meta['citation_date'] || meta['date'] || meta['dc.date'] ||
    article.datePublished || article.dateCreated || ''
  const dateMatch = /(\d{4}(?:-\d{1,2}(?:-\d{1,2})?)?)/.exec(String(rawDate))
  const publishedDate = dateMatch ? dateMatch[1] : ''

  return {
    title: title || '',
    author: author || '',
    publisher: publisher || '',
    publishedDate,
    url: finalUrl || meta['og:url'] || '',
  }
}
