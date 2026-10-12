import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// ── Why a test reads every email call site (2026-10-11) ───────────────────────────────
// brainscribe.io has NO MX record. Every BrainScribe email comes from
// notifications@brainscribe.io, so a reply to one — a parent answering a consent email,
// a requester answering "we got your request" — BOUNCES, and nobody is told. The fix is a
// `reply_to` on every Resend payload. This guard makes the NEXT sender unable to forget:
// it finds every `api.resend.com/emails` call in app/ and lib/ and fails if the JSON
// payload posted there has no `reply_to` key.
//
// Source-level on purpose (precedent: lib/wiring.test.js): there is no type checker on
// these .js files, and a missing header is invisible to the build and to every
// behavioural test that stubs fetch.

const ROOT = join(import.meta.dirname, '..')
const ENDPOINT = 'api.resend.com/emails'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(js|jsx|mjs)$/.test(name) && !/\.test\.(js|mjs)$/.test(name)) out.push(p)
  }
  return out
}

/** The object literal handed to the first JSON.stringify( after `from` — brace-matched. */
function payloadAfter(src, from) {
  const call = src.indexOf('JSON.stringify(', from)
  if (call === -1) return null
  const open = src.indexOf('{', call)
  // The payload must be the stringify argument itself, not something much later.
  if (open === -1 || open - call > 'JSON.stringify('.length + 2) return null
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}' && --depth === 0) return src.slice(open, i + 1)
  }
  return null
}

/** Every Resend call site in a source string, and whether its payload sets reply_to. */
export function resendCallSites(src) {
  const sites = []
  for (let at = src.indexOf(ENDPOINT); at !== -1; at = src.indexOf(ENDPOINT, at + 1)) {
    const payload = payloadAfter(src, at)
    const line = src.slice(0, at).split('\n').length
    sites.push({ line, payload, hasReplyTo: !!payload && /(^|[\s{,])reply_to\s*:/.test(payload) })
  }
  return sites
}

const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))]
const sites = files.flatMap(f => {
  const src = readFileSync(f, 'utf8')
  return resendCallSites(src).map(s => ({ ...s, file: relative(ROOT, f) }))
})

describe('every outbound email sets reply_to (replies must not bounce)', () => {
  // A finder that finds nothing passes every assertion below. These are the call sites
  // that existed when the guard was written; the count may grow, never silently shrink.
  it('finds the known call sites (the guard is actually looking)', () => {
    const byFile = f => sites.filter(s => s.file === f).length
    expect(byFile('lib/notifications.js')).toBeGreaterThanOrEqual(6)
    expect(byFile('lib/coppaConsent.js')).toBeGreaterThanOrEqual(2)
    expect(byFile('app/api/coppa/initiate/route.js')).toBe(1)
    expect(byFile('app/api/coppa/request-parent-setup/route.js')).toBe(1)
    expect(byFile('app/api/coppa/resend/route.js')).toBe(1)
    expect(sites.length).toBeGreaterThanOrEqual(11)
  })

  it('every call site posts a payload we could read', () => {
    const unreadable = sites.filter(s => !s.payload).map(s => `${s.file}:${s.line}`)
    expect(unreadable, 'could not find the JSON.stringify({...}) payload — keep it inline so this guard can see it').toEqual([])
  })

  it('every payload has reply_to', () => {
    const missing = sites.filter(s => !s.hasReplyTo).map(s => `${s.file}:${s.line}`)
    expect(missing, 'these sends have no reply_to — replies to them BOUNCE (brainscribe.io has no MX)').toEqual([])
  })

  it('nobody sends through the Resend SDK, which this guard cannot see', () => {
    const sdk = files.filter(f => /from ['"]resend['"]|require\(['"]resend['"]\)/.test(readFileSync(f, 'utf8')))
    expect(sdk.map(f => relative(ROOT, f))).toEqual([])
  })

  it('user-facing mail replies to the ONE support address, not a scattered literal', () => {
    const literal = sites.filter(s => /reply_to\s*:\s*['"`]/.test(s.payload ?? '')).map(s => `${s.file}:${s.line}`)
    expect(literal).toEqual([])
    expect(readFileSync(join(ROOT, 'lib/site.js'), 'utf8')).toContain("export const SUPPORT_EMAIL = 'brainscribe.io@gmail.com'")
  })
})

// The checker itself, against synthetic sources — including the exact failure it exists
// for. If this block passes while the real-tree block would miss a site, the checker is
// broken, not the senders.
describe('resendCallSites — positive controls', () => {
  it('flags a payload WITHOUT reply_to', () => {
    const src = `await fetch('https://api.resend.com/emails', { method: 'POST', body: JSON.stringify({ from: 'x', to, subject, html }) })`
    expect(resendCallSites(src)).toEqual([expect.objectContaining({ hasReplyTo: false })])
  })
  it('passes a payload WITH reply_to, inline or multi-line, nested objects included', () => {
    const one = `fetch('https://api.resend.com/emails', { body: JSON.stringify({ from: 'x', reply_to: SUPPORT_EMAIL, to, html }) })`
    const multi = `fetch('https://api.resend.com/emails', {\n  body: JSON.stringify({\n    from: 'x',\n    headers: { 'List-Unsubscribe': u },\n    reply_to: replyTo || SUPPORT_EMAIL,\n    to,\n  }),\n})`
    expect(resendCallSites(one)[0].hasReplyTo).toBe(true)
    expect(resendCallSites(multi)[0].hasReplyTo).toBe(true)
  })
  it('does not credit a reply_to that sits OUTSIDE the payload (e.g. in a later call)', () => {
    const src = `fetch('https://api.resend.com/emails', { body: JSON.stringify({ from: 'x', to }) })\nconst other = { reply_to: 'y' }`
    expect(resendCallSites(src)[0].hasReplyTo).toBe(false)
  })
  it('a key that merely ENDS in reply_to does not count', () => {
    const src = `fetch('https://api.resend.com/emails', { body: JSON.stringify({ from: 'x', not_reply_to: 1, to }) })`
    expect(resendCallSites(src)[0].hasReplyTo).toBe(false)
  })
})
