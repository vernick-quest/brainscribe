import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateAccessRequest, recordAccessRequest, WELCOME_REQUEST_SOURCE } from './accessRequest.js'
import { classifySubscriber, isAccessRequest } from './waitlist.js'
import { mailDecision } from './blogMail.js'

// "No code? Ask for one" on the /welcome code step. What these tests hold, in the
// product owner's terms:
//   • one tap → one request → ONE admin alert; a repeat tap → none
//   • an under-13 account is refused by the SERVER, whatever the client sends
//   • the address used is the SESSION's, never one in the request body
//   • no path ends with the owner un-alerted AND nothing logged
// Every assertion is on what reached the table or the (spied) senders — never a status
// code alone. No real mail is sent: the senders are spies, and no network is touched.

const NOW = new Date('2026-10-11T19:00:00Z')
const SESSION_EMAIL = 'teen.writer@example.com'
const ADMIN = 'owner@example.com'

// ── A stateful stand-in for the bits of supabase-js these paths use ───────────────────
// Rows live in plain arrays so a test can read back what was actually written. The
// upsert honours ON CONFLICT DO NOTHING and returns ONLY inserted rows, like PostgREST
// with Prefer: resolution=ignore-duplicates,return=representation.
function fakeDb({ profiles = [], subscribers = [], profileErr = null, insertErr = null, readErr = null } = {}) {
  const db = { profiles: profiles.map(p => ({ ...p })), subscribers: subscribers.map(r => ({ ...r })), calls: [] }
  db.client = {
    from(table) {
      const q = { table, ops: [], kind: 'select' }
      db.calls.push(q)
      const rows = () => db[table]
      const matches = r => q.ops.every(([op, col, val]) => {
        if (op === 'eq') return r[col] === val
        if (op === 'is') return val === null ? r[col] == null : r[col] === val
        if (op === 'ilike') return String(r[col] ?? '').toLowerCase() === String(val).replace(/\\(.)/g, '$1')
        if (op === 'not') return r[col] != null
        return true
      })
      const run = () => {
        if (table === 'profiles' && profileErr && q.kind === 'select' && q.ops.some(o => o[0] === 'eq' && o[1] === 'id')) {
          return { data: null, error: profileErr }
        }
        if (q.kind === 'upsert') {
          if (insertErr) return { data: null, error: insertErr }
          if (rows().some(r => r.email === q.payload.email)) return { data: [], error: null }
          const row = { invited_at: null, dismissed_at: null, ...q.payload, created_at: NOW.toISOString() }
          rows().push(row)
          return { data: [{ email: row.email }], error: null }
        }
        if (q.kind === 'update') {
          const hit = rows().filter(matches)
          for (const r of hit) Object.assign(r, q.payload)
          return { data: hit.map(r => ({ email: r.email })), error: null }
        }
        if (table === 'subscribers' && readErr) return { data: null, error: readErr }
        return { data: rows().filter(matches), error: null }
      }
      const b = {
        then: (res, rej) => Promise.resolve(run()).then(res, rej),
        upsert(payload) { q.kind = 'upsert'; q.payload = payload; return b },
        update(payload) { q.kind = 'update'; q.payload = payload; return b },
        maybeSingle() {
          const r = run()
          return Promise.resolve(r.error ? r : { data: r.data[0] ?? null, error: null })
        },
      }
      for (const m of ['select', 'order', 'range']) b[m] = () => b
      for (const m of ['eq', 'is', 'ilike']) b[m] = (col, val) => { q.ops.push([m, col, val]); return b }
      b.not = (col) => { q.ops.push(['not', col]); return b }
      return b
    },
  }
  return db
}

const teenProfile = (over = {}) => ({
  id: 'u-teen', email: SESSION_EMAIL, role: 'student', age_bracket: null,
  coppa_consent_required: false, birthdate: null, access_granted: false, access_code_used: null, ...over,
})
const adminProfile = { id: 'u-admin', email: ADMIN, role: 'admin', access_granted: true }

let errSpy, warnSpy
beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { errSpy.mockRestore(); warnSpy.mockRestore() })
const loggedLoudly = re => errSpy.mock.calls.some(a => re.test(a.map(String).join(' ')))

// ─────────────────────────────────────────────────────────────────────────────────────
describe('evaluateAccessRequest — who may ask (COPPA first)', () => {
  const ok13 = { assertedBracket: '13plus', now: NOW }

  it('a fresh 13+ account with no code may ask', () => {
    expect(evaluateAccessRequest({ profile: teenProfile(), ...ok13 })).toEqual({ ok: true })
  })

  it('REFUSES an under-13 account even when the client asserts 13+', () => {
    const v = evaluateAccessRequest({ profile: teenProfile({ age_bracket: 'under13' }), ...ok13 })
    expect(v).toMatchObject({ ok: false, status: 403, code: 'coppa_protected' })
  })

  it('REFUSES coppa_consent_required even if the bracket somehow reads 13plus (sticky)', () => {
    const v = evaluateAccessRequest({ profile: teenProfile({ age_bracket: '13plus', coppa_consent_required: true }), ...ok13 })
    expect(v).toMatchObject({ ok: false, status: 403, code: 'coppa_protected' })
  })

  it('REFUSES a stored birthdate that derives under-13, whatever the bracket says', () => {
    const v = evaluateAccessRequest({ profile: teenProfile({ birthdate: '2016-01-01' }), ...ok13 })
    expect(v).toMatchObject({ ok: false, status: 403, code: 'coppa_protected' })
    // and a 13+ birthdate passes
    expect(evaluateAccessRequest({ profile: teenProfile({ birthdate: '2010-01-01' }), ...ok13 })).toEqual({ ok: true })
  })

  it('COPPA outranks every other answer — a protected admin/granted/no-assertion row still gets coppa_protected', () => {
    for (const over of [{ access_granted: true }, { role: 'admin' }]) {
      const v = evaluateAccessRequest({ profile: teenProfile({ age_bracket: 'under13', ...over }), assertedBracket: null, now: NOW })
      expect(v.code).toBe('coppa_protected')
    }
  })

  it('requires an explicit 13+ assertion — a missing or under13 assertion is refused', () => {
    for (const assertedBracket of [undefined, null, '', 'under13', '13PLUS', 'yes']) {
      const v = evaluateAccessRequest({ profile: teenProfile(), assertedBracket, now: NOW })
      expect(v, String(assertedBracket)).toMatchObject({ ok: false, code: 'age_required' })
    }
  })

  it('no profile row → refused, not waved through', () => {
    expect(evaluateAccessRequest({ profile: null, ...ok13 })).toMatchObject({ ok: false, code: 'no_profile' })
  })

  it('an account that already has access is told so (no request filed)', () => {
    expect(evaluateAccessRequest({ profile: teenProfile({ access_granted: true }), ...ok13 }))
      .toMatchObject({ ok: false, code: 'already_has_access' })
  })

  it('an admin is refused', () => {
    expect(evaluateAccessRequest({ profile: teenProfile({ role: 'admin' }), ...ok13 }).code).toBe('admin')
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────
describe('recordAccessRequest — at most one "new" verdict per address', () => {
  it('first tap inserts a welcome row and returns it as inserted', async () => {
    const db = fakeDb()
    const r = await recordAccessRequest(db.client, '  Teen.Writer@Example.com ')
    expect(r).toEqual({ ok: true, outcome: 'requested', inserted: [{ email: SESSION_EMAIL }] })
    expect(db.subscribers).toHaveLength(1)
    expect(db.subscribers[0]).toMatchObject({ email: SESSION_EMAIL, source: WELCOME_REQUEST_SOURCE })
  })

  it('a repeat tap inserts nothing and is NOT new', async () => {
    const db = fakeDb()
    await recordAccessRequest(db.client, SESSION_EMAIL)
    const r = await recordAccessRequest(db.client, SESSION_EMAIL)
    expect(r).toEqual({ ok: true, outcome: 'already_requested' })
    expect(db.subscribers).toHaveLength(1)
  })

  it('an earlier LANDING-form request counts as already asked (the owner was alerted then)', async () => {
    const db = fakeDb({ subscribers: [{ email: SESSION_EMAIL, source: 'waitlist' }] })
    expect((await recordAccessRequest(db.client, SESSION_EMAIL)).outcome).toBe('already_requested')
    expect(db.subscribers[0].source).toBe('waitlist') // untouched
  })

  it('an address we already SENT a code to is told so', async () => {
    const db = fakeDb({ subscribers: [{ email: SESSION_EMAIL, source: 'waitlist', invited_at: '2026-10-01T00:00:00Z' }] })
    expect((await recordAccessRequest(db.client, SESSION_EMAIL)).outcome).toBe('already_invited')
  })

  it('a DISMISSED address is not re-alerted, but it is logged — never silent', async () => {
    const db = fakeDb({ subscribers: [{ email: SESSION_EMAIL, source: 'waitlist', dismissed_at: '2026-10-01T00:00:00Z' }] })
    expect((await recordAccessRequest(db.client, SESSION_EMAIL)).outcome).toBe('already_requested')
    expect(warnSpy.mock.calls.some(a => /DISMISSED/.test(a.join(' ')))).toBe(true)
  })

  // The silent-never-alerts case: a blog subscriber asking for access would otherwise
  // conflict on the unique email and be a no-op forever.
  it('a BLOG row is converted exactly once into an access request — and is new that once', async () => {
    const db = fakeDb({ subscribers: [{ email: SESSION_EMAIL, source: 'blog' }] })
    const first = await recordAccessRequest(db.client, SESSION_EMAIL)
    expect(first).toEqual({ ok: true, outcome: 'requested', inserted: [{ email: SESSION_EMAIL }] })
    expect(db.subscribers[0].source).toBe(WELCOME_REQUEST_SOURCE)
    expect((await recordAccessRequest(db.client, SESSION_EMAIL)).outcome).toBe('already_requested')
  })

  it('a row with a NULL source is converted via `is null`, not an eq that can never match', async () => {
    const db = fakeDb({ subscribers: [{ email: SESSION_EMAIL, source: null }] })
    expect((await recordAccessRequest(db.client, SESSION_EMAIL)).outcome).toBe('requested')
    expect(db.subscribers[0].source).toBe(WELCOME_REQUEST_SOURCE)
  })

  it('an insert failure is a loud failure, not "already requested"', async () => {
    const db = fakeDb({ insertErr: { message: 'boom' } })
    const r = await recordAccessRequest(db.client, SESSION_EMAIL)
    expect(r).toMatchObject({ ok: false, outcome: 'failed' })
    expect(loggedLoudly(/insert FAILED/)).toBe(true)
  })

  it('an unreadable existing row is a loud failure — it might be a blog row nobody was told about', async () => {
    const db = fakeDb({ subscribers: [{ email: SESSION_EMAIL, source: 'blog' }], readErr: { message: 'nope' } })
    const r = await recordAccessRequest(db.client, SESSION_EMAIL)
    expect(r).toMatchObject({ ok: false, outcome: 'failed', reason: 'existing_unreadable' })
    expect(loggedLoudly(/cannot tell whether the owner was ever alerted/)).toBe(true)
  })

  it('no email → failed, nothing written', async () => {
    const db = fakeDb()
    expect((await recordAccessRequest(db.client, '')).ok).toBe(false)
    expect(db.calls).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// The route itself, end to end, with every I/O edge mocked: auth session, service DB,
// rate limiter, after(), and the two mail senders. This is where "the session's email,
// not the body's" and "one alert" are actually proven.
const h = vi.hoisted(() => ({ user: null, db: null, after: [], ack: null, alert: null }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => h.db.client }))
vi.mock('@/lib/ratelimit', () => ({ checkRateLimit: async () => true, rateLimited: m => Response.json({ error: m }, { status: 429 }) }))
vi.mock('@/lib/notifications', () => ({
  sendWaitlistAck: (...a) => h.ack(...a),
  sendAdminAlert: (...a) => h.alert(...a),
}))
vi.mock('next/server', () => ({ after: fn => { h.after.push(fn) } }))

async function tap(body = { ageBracket: '13plus' }) {
  const { POST } = await import('../app/api/access/request/route.js')
  const res = await POST(new Request('http://localhost/api/access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }))
  // Run deferred work the way the platform would, after the response.
  const pending = h.after.splice(0)
  for (const fn of pending) await fn()
  return { status: res.status, body: await res.json() }
}

describe('POST /api/access/request — the route', () => {
  beforeEach(() => {
    h.user = { id: 'u-teen', email: 'Teen.Writer@Example.com' }
    h.db = fakeDb({ profiles: [teenProfile(), adminProfile] })
    h.after = []
    h.ack = vi.fn(async () => true)
    h.alert = vi.fn(async () => true)
  })

  it('one tap → one request row → one ack → ONE admin alert that says "no code, stuck at the code screen"', async () => {
    const r = await tap()
    expect(r).toEqual({ status: 200, body: { ok: true, status: 'requested', email: SESSION_EMAIL } })
    expect(h.db.subscribers).toEqual([expect.objectContaining({ email: SESSION_EMAIL, source: 'welcome' })])
    expect(h.ack).toHaveBeenCalledTimes(1)
    expect(h.ack).toHaveBeenCalledWith({ to: SESSION_EMAIL })
    expect(h.alert).toHaveBeenCalledTimes(1)
    const { to, subject, text } = h.alert.mock.calls[0][0]
    expect(to).toEqual([ADMIN])
    expect(subject).toBe(`BrainScribe: new access request from ${SESSION_EMAIL}`)
    expect(text).toContain('Account:  Has a student account but NO access yet (no code recorded) — stuck at the code screen. Send them a code.')
    expect(text).toContain('Source:   the code screen after sign-in ("No code? Ask for one")')
    expect(text).toContain('Receipt:  Sent')
    expect(h.alert.mock.calls[0][0].replyTo).toBe(SESSION_EMAIL)
  })

  it('the resulting row shows in the admin queue as locked_out / "No code"', async () => {
    await tap()
    const row = h.db.subscribers[0]
    expect(isAccessRequest(row)).toBe(true)
    expect(classifySubscriber(row, { ...teenProfile(), sessionCount: 0, turnCount: 0 })).toBe('locked_out')
    // and it is never mistaken for a blog subscriber
    expect(mailDecision(row).mail).toBe(false)
  })

  it('a repeat tap → no new row, no ack, NO second alert', async () => {
    await tap()
    const r = await tap()
    expect(r.body).toEqual({ ok: true, status: 'already_requested', email: SESSION_EMAIL })
    expect(h.db.subscribers).toHaveLength(1)
    expect(h.ack).toHaveBeenCalledTimes(1)
    expect(h.alert).toHaveBeenCalledTimes(1)
  })

  it('five rapid taps in parallel → still exactly one alert', async () => {
    const { POST } = await import('../app/api/access/request/route.js')
    const mk = () => new Request('http://localhost/api/access/request', { method: 'POST', body: JSON.stringify({ ageBracket: '13plus' }) })
    await Promise.all([1, 2, 3, 4, 5].map(() => POST(mk())))
    for (const fn of h.after.splice(0)) await fn()
    expect(h.db.subscribers).toHaveLength(1)
    expect(h.alert).toHaveBeenCalledTimes(1)
  })

  it('uses the SESSION email — an `email` in the body is ignored entirely', async () => {
    const r = await tap({ ageBracket: '13plus', email: 'victim@example.com' })
    expect(r.body.email).toBe(SESSION_EMAIL)
    expect(h.db.subscribers.map(s => s.email)).toEqual([SESSION_EMAIL])
    expect(h.ack).toHaveBeenCalledWith({ to: SESSION_EMAIL })
    const everything = JSON.stringify([h.db.subscribers, h.ack.mock.calls, h.alert.mock.calls])
    expect(everything).not.toContain('victim')
  })

  it('an UNDER-13 account is refused SERVER-side: 403, no row, no ack, no alert — even asserting 13+', async () => {
    h.db = fakeDb({ profiles: [teenProfile({ age_bracket: 'under13', coppa_consent_required: true }), adminProfile] })
    const r = await tap({ ageBracket: '13plus' })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('coppa_protected')
    expect(h.db.subscribers).toHaveLength(0)
    expect(h.db.calls.some(c => c.table === 'subscribers')).toBe(false)
    expect(h.ack).not.toHaveBeenCalled()
    expect(h.alert).not.toHaveBeenCalled()
  })

  it('a sticky coppa_consent_required account is refused the same way', async () => {
    h.db = fakeDb({ profiles: [teenProfile({ age_bracket: '13plus', coppa_consent_required: true }), adminProfile] })
    const r = await tap()
    expect(r.status).toBe(403)
    expect(h.db.subscribers).toHaveLength(0)
  })

  it('a FAILED profile read fails CLOSED (503) — never treated as "not protected"', async () => {
    h.db = fakeDb({ profiles: [teenProfile({ age_bracket: 'under13' })], profileErr: { message: 'timeout' } })
    const r = await tap()
    expect(r.status).toBe(503)
    expect(h.db.calls.some(c => c.table === 'subscribers')).toBe(false)
    expect(h.alert).not.toHaveBeenCalled()
  })

  it('no 13+ assertion in the body → 400, nothing written', async () => {
    const r = await tap({})
    expect(r.status).toBe(400)
    expect(h.db.subscribers).toHaveLength(0)
  })

  it('signed out → 401, nothing read or written', async () => {
    h.user = null
    const r = await tap()
    expect(r.status).toBe(401)
    expect(h.db.calls).toHaveLength(0)
  })

  it('already has access → no request, no alert', async () => {
    h.db = fakeDb({ profiles: [teenProfile({ access_granted: true }), adminProfile] })
    const r = await tap()
    expect(r.body).toEqual({ ok: true, status: 'already_has_access' })
    expect(h.db.subscribers).toHaveLength(0)
    expect(h.alert).not.toHaveBeenCalled()
  })

  it('a blog subscriber who asks DOES alert, once', async () => {
    h.db = fakeDb({ profiles: [teenProfile(), adminProfile], subscribers: [{ email: SESSION_EMAIL, source: 'blog' }] })
    expect((await tap()).body.status).toBe('requested')
    expect((await tap()).body.status).toBe('already_requested')
    expect(h.alert).toHaveBeenCalledTimes(1)
  })

  it('a record failure is a 500 the screen can show — never a false "Request sent"', async () => {
    h.db = fakeDb({ profiles: [teenProfile(), adminProfile], insertErr: { message: 'down' } })
    const r = await tap()
    expect(r.status).toBe(500)
    expect(r.body.ok).toBeUndefined()
    expect(h.alert).not.toHaveBeenCalled()
  })

  it('an alert that cannot send is logged loudly by the route', async () => {
    h.alert = vi.fn(async () => false)
    await tap()
    expect(loggedLoudly(/admin NOT alerted about/)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// "Reproduce the REAL request shape": the de-dup lives in what PostgREST is asked to do,
// so the real supabase-js is driven against a capturing fetch. Nothing leaves the process.
describe('request shape (real supabase-js, captured fetch)', () => {
  async function capture(run, reply = '[]') {
    const { createClient } = await import('@supabase/supabase-js')
    const seen = []
    const client = createClient('https://example.supabase.co', 'service-key-not-real', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (url, init) => {
          seen.push({ url: String(url), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: init?.body })
          const body = typeof reply === 'function' ? reply(seen.length) : reply
          return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
        },
      },
    })
    await run(client)
    return seen
  }

  it('the insert is ON CONFLICT DO NOTHING on email, returning rows', async () => {
    const [req] = await capture(c => recordAccessRequest(c, SESSION_EMAIL), '[{"email":"teen.writer@example.com"}]')
    expect(req.method).toBe('POST')
    const u = new URL(req.url)
    expect(u.pathname).toBe('/rest/v1/subscribers')
    expect(u.searchParams.get('on_conflict')).toBe('email')
    expect(req.headers.get('prefer')).toMatch(/resolution=ignore-duplicates/)
    // Without return=representation every tap would read as "already requested" and the
    // alert would silently never fire.
    expect(req.headers.get('prefer')).toMatch(/return=representation/)
    expect(JSON.parse(req.body)).toEqual({ email: SESSION_EMAIL, source: 'welcome' })
  })

  it('a blog row is converted with a CONDITIONAL PATCH (email AND the source we read), returning rows', async () => {
    const replies = ['[]', '{"email":"teen.writer@example.com","source":"blog","invited_at":null,"dismissed_at":null}', '[]']
    const reqs = await capture(c => recordAccessRequest(c, SESSION_EMAIL), n => replies[n - 1])
    const patch = reqs[2]
    expect(patch.method).toBe('PATCH')
    const u = new URL(patch.url)
    expect(u.searchParams.get('email')).toBe(`eq.${SESSION_EMAIL}`)
    expect(u.searchParams.get('source')).toBe('eq.blog')
    expect(patch.headers.get('prefer')).toMatch(/return=representation/)
    expect(JSON.parse(patch.body)).toEqual({ source: 'welcome' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// Wiring a unit test cannot reach: the button exists only on the 13+ code step, sends no
// email, and the server reads none.
describe('wiring', () => {
  const ROOT = join(import.meta.dirname, '..')
  const read = f => readFileSync(join(ROOT, f), 'utf8')

  it('the route never reads an email from the body, and uses the session user', () => {
    const src = read('app/api/access/request/route.js')
    expect(src).not.toMatch(/body\??\.email/)
    expect(src).toMatch(/const email = String\(user\.email \?\? ''\)/)
    expect(src).toMatch(/recordAccessRequest\(service, email\)/)
    expect(src).toMatch(/if \(recorded\.outcome === 'requested'\) \{[\s\S]*?after\(async \(\) => \{[\s\S]*?notifyOnSubscribe\(\{/)
    expect(src.match(/notifyOnSubscribe\(/g)).toHaveLength(1)
    // fail closed on the COPPA read
    expect(src).toMatch(/if \(profileErr\) \{[\s\S]*?status: 503/)
  })

  it('/welcome renders the button ONLY inside the access-code step, and posts no email', () => {
    const src = read('app/(auth)/welcome/page.js')
    const codeStep = src.indexOf("if (step === 'access-code') {")
    const nextStep = src.indexOf("if (step === 'role') {")
    expect(codeStep).toBeGreaterThan(-1)
    const button = src.indexOf('No code? Ask for one</')
    const buttonLabel = src.indexOf("'No code? Ask for one'")
    const at = button > -1 ? button : buttonLabel
    expect(at, 'button label not found').toBeGreaterThan(-1)
    expect(at > codeStep && at < nextStep, 'button rendered outside the access-code step').toBe(true)
    expect(src.match(/onClick=\{handleAskForCode\}/g)).toHaveLength(1)
    expect(src.indexOf('onClick={handleAskForCode}')).toBeGreaterThan(codeStep)
    expect(src.indexOf('onClick={handleAskForCode}')).toBeLessThan(nextStep)
    // the request body is the age assertion only
    expect(src).toMatch(/fetch\('\/api\/access\/request',[\s\S]*?body: JSON\.stringify\(\{ ageBracket \}\)/)
    // and the owner's address is visible as a way out
    expect(src).toMatch(/mailto:\$\{SUPPORT_EMAIL\}/)
  })
})
