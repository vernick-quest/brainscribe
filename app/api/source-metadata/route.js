// app/api/source-metadata/route.js — SSRF-guarded URL → citation-metadata fetch.
//
// 🔴 SECURITY: this is BrainScribe's FIRST server-side fetch of arbitrary
// student-supplied URLs. It returns ONLY extracted citation fields, never page
// content. Layers (see lib/ssrf.js): scheme allowlist + no-credentials +
// no-localhost/.internal (isDisallowedUrl), DNS-resolve-and-validate EVERY address
// (classifyIp), socket PINNED to the validated IP (closes DNS-rebinding TOCTOU),
// per-hop revalidation across ≤3 redirects, 3s + 1MB caps, generic UA, no cookies
// forwarded. FLAGGED for the conductor's auth-coppa/security pass — see TESTING.md.
//
// Failure is never a dead end: the client falls back to a guided manual card.

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { canUseCoach, coachGateResponse } from '@/lib/coppa'
import { isDisallowedUrl, classifyIp, canonicalizeStoredUrl } from '@/lib/ssrf'
import { extractCitationMeta } from '@/lib/citationMeta'
import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'

export const runtime = 'nodejs'   // needs node:dns / node:https for IP-pinned fetch

const MAX_BYTES = 1024 * 1024        // 1 MB body cap
const TIMEOUT_MS = 3000              // per-hop socket-inactivity timeout
const TOTAL_MS = 8000                // hard wall-clock deadline across ALL hops
const MAX_REDIRECTS = 3
const UA = 'BrainScribeBot/1.0 (+https://www.brainscribe.io)'

// Resolve host → a validated PUBLIC ip, or throw. Rejects if ANY resolved address
// is private/reserved (defense against a hostname that resolves to a mix).
async function resolvePublicIp(hostname) {
  let addrs
  try { addrs = await dns.lookup(hostname, { all: true }) }
  catch { throw new FetchError('dns-failed') }
  if (!addrs.length) throw new FetchError('dns-empty')
  for (const { address, family } of addrs) {
    if (classifyIp(address, family).private) throw new FetchError('private-address')
  }
  return addrs[0]   // all validated public; pin the first
}

class FetchError extends Error {
  constructor(reason) { super(reason); this.reason = reason }
}

// One guarded request, socket pinned to `pinnedIp`. Resolves { status, location, body }.
// `budgetMs` is the remaining wall-clock budget — the socket timeout is the smaller of
// the per-hop inactivity limit and what's left of the total deadline (defeats a slow
// server dribbling bytes just under the inactivity timeout).
function requestOnce(urlObj, pinnedIp, budgetMs = TIMEOUT_MS) {
  const mod = urlObj.protocol === 'https:' ? https : http
  const hardMs = Math.max(500, Math.min(TIMEOUT_MS, budgetMs))
  return new Promise((resolve0, reject0) => {
    // HARD wall-clock kill. `timeout:` below is socket-INACTIVITY only — a slow
    // server dribbling one byte per (timeout−ε) stays alive indefinitely, and it
    // doesn't cover the header phase at all. This timer destroys the request after
    // the budget no matter what, and is cleared the moment the promise settles.
    let killer = null
    const done = () => { if (killer) { clearTimeout(killer); killer = null } }
    const resolve = v => { done(); resolve0(v) }
    const reject = e => { done(); reject0(e) }
    const req = mod.request(urlObj, {
      method: 'GET',
      // Pin the connection to the pre-validated IP — DNS can't be re-resolved to an
      // internal address between our check and connect (rebinding TOCTOU closed).
      // Node's autoSelectFamily (default since 18.13) calls lookup with { all: true }
      // and expects the ARRAY callback form; support both so the pin actually applies.
      lookup: (_host, opts, cb) => opts && opts.all
        ? cb(null, [{ address: pinnedIp.address, family: pinnedIp.family }])
        : cb(null, pinnedIp.address, pinnedIp.family),
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en',
        // no Cookie / Authorization — nothing of ours is ever forwarded
      },
      timeout: hardMs,
    }, res => {
      const status = res.statusCode || 0
      // Redirect: hand the Location back up; don't read the body.
      if (status >= 300 && status < 400 && res.headers.location) {
        res.destroy()
        return resolve({ status, location: res.headers.location })
      }
      const ctype = String(res.headers['content-type'] || '')
      if (!/text\/html|application\/xhtml/i.test(ctype)) {
        res.destroy()
        return resolve({ status, body: '', nonHtml: true })
      }
      let bytes = 0
      const chunks = []
      res.on('data', chunk => {
        bytes += chunk.length
        if (bytes > MAX_BYTES) { res.destroy(); return resolve({ status, body: Buffer.concat(chunks).toString('utf8') }) }
        chunks.push(chunk)
      })
      res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('timeout', () => { req.destroy(new FetchError('timeout')) })
    req.on('error', err => reject(err instanceof FetchError ? err : new FetchError('request-failed')))
    killer = setTimeout(() => req.destroy(new FetchError('timeout')), hardMs)
    req.end()
  })
}

// Follow up to MAX_REDIRECTS hops, revalidating URL + DNS at EACH hop.
async function guardedFetch(startUrl) {
  const deadline = Date.now() + TOTAL_MS
  let current = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (Date.now() >= deadline) throw new FetchError('timeout')
    const reason = isDisallowedUrl(current)
    if (reason) throw new FetchError(reason)
    const urlObj = new URL(current)
    const pinnedIp = await resolvePublicIp(urlObj.hostname)
    const res = await requestOnce(urlObj, pinnedIp, deadline - Date.now())
    if (res.status >= 300 && res.status < 400 && res.location) {
      current = new URL(res.location, urlObj).toString()   // resolve relative redirects
      continue
    }
    return { finalUrl: current, body: res.body || '', nonHtml: !!res.nonHtml }
  }
  throw new FetchError('too-many-redirects')
}

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: gate } = await supabase
    .from('profiles').select('role, age_bracket, coppa_consent_required, coppa_consent_given').eq('id', user.id).single()
  if (!canUseCoach(gate)) return coachGateResponse()

  // Tight limit — this reaches out to the public internet on the student's behalf.
  if (!await checkRateLimit(`source-metadata:${user.id}`, 15, 60)) return rateLimited()

  const { url } = await request.json().catch(() => ({}))
  if (!url || typeof url !== 'string') return Response.json({ error: 'Missing url' }, { status: 400 })

  const preReason = isDisallowedUrl(url)
  if (preReason) {
    // Not fetched — tell the client to fall back to a manual card (never a dead end).
    return Response.json({ ok: false, reason: preReason, fallback: true }, { status: 200 })
  }

  try {
    const { finalUrl, body, nonHtml } = await guardedFetch(url)
    const meta = nonHtml
      ? { title: '', author: '', publisher: '', publishedDate: '', url: finalUrl }
      : extractCitationMeta(body, finalUrl)
    // Store the canonical URL (query/fragment/userinfo stripped — no tracking PII).
    meta.url = canonicalizeStoredUrl(meta.url || finalUrl)
    return Response.json({ ok: true, metadata: meta })
  } catch (e) {
    const reason = e?.reason || 'fetch-failed'
    // 200 with fallback:true — the UI opens a guided manual card, not an error toast.
    return Response.json({ ok: false, reason, fallback: true }, { status: 200 })
  }
}
