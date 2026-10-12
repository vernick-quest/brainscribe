import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  formatPacific, adminRecipients, escapeLikePattern, indexAccountsByEmail, describeAccount,
  shouldAlertAccessRequest, buildAccessRequestAlert, buildNewAccountAlert,
  alertAdmins, notifyOnSubscribe, notifyNewAccount, findAccountByEmail,
} from './accessAlerts.js'

// The failure this file guards is SILENCE: someone asked for access on 2026-09-02 and
// the owner heard nothing for 19+ days, because the endpoint only ever wrote to the
// requester. Every test below asserts on what was (or was not) handed to `send`, and on
// the loud log when nothing could be — never on a status code.
//
// No real mail is sent anywhere in this file: `send` is a spy, and the one test that
// touches the real Resend sender stubs global fetch.

const ADMIN = 'owner@example.com'
const REQUESTER = 'asker@example.com'
const NOW = new Date('2026-09-02T22:14:00Z') // 3:14 PM PDT on Sep 2

// A chainable stand-in for the supabase-js query builder. Every call is recorded so a
// test can assert the REQUEST shape (which table, which filters), and `respond` picks
// the result from that shape.
function fakeService(respond) {
  const calls = []
  return {
    calls,
    from(table) {
      const q = { table, ops: [] }
      calls.push(q)
      const result = () => Promise.resolve(respond(q))
      const b = { then: (res, rej) => result().then(res, rej) }
      for (const m of ['select', 'eq', 'not', 'ilike', 'order', 'range', 'in']) {
        b[m] = (...args) => { q.ops.push([m, ...args]); return b }
      }
      b.maybeSingle = () => { q.ops.push(['maybeSingle']); return result() }
      return b
    },
  }
}

const has = (q, op, ...args) => q.ops.some(o => o[0] === op && args.every((a, i) => o[i + 1] === a))
const isAdminLookup = q => q.table === 'profiles' && has(q, 'eq', 'role', 'admin')
const isAccountLookup = q => q.table === 'profiles' && q.ops.some(o => o[0] === 'ilike')

// A world with exactly one admin and no account for the requester, unless overridden.
function world({ admins = [{ email: ADMIN }], adminErr = null, accounts = [], accountErr = null, waitlist = null } = {}) {
  return fakeService(q => {
    if (isAdminLookup(q)) return adminErr ? { data: null, error: adminErr } : { data: admins, error: null }
    if (isAccountLookup(q)) return accountErr ? { data: null, error: accountErr } : { data: accounts, error: null }
    if (q.table === 'subscribers') return { data: waitlist, error: null }
    throw new Error(`unexpected query on ${q.table}: ${JSON.stringify(q.ops)}`)
  })
}

let errSpy
beforeEach(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { errSpy.mockRestore() })
const loggedLoudly = (re) => errSpy.mock.calls.some(args => re.test(args.map(String).join(' ')))

describe('formatPacific — the owner reads San Francisco time, never UTC', () => {
  it('renders a summer timestamp in PDT', () => {
    const s = formatPacific(NOW)
    expect(s).toContain('Sep 2, 2026')
    expect(s).toContain('3:14 PM')
    expect(s).toContain('PDT')
  })

  it('renders a winter timestamp in PST', () => {
    const s = formatPacific('2026-12-01T20:00:00Z')
    expect(s).toContain('12:00 PM')
    expect(s).toContain('PST')
  })

  // The case UTC gets visibly wrong: 03:30 UTC on Sep 3 is still the evening of Sep 2.
  it('puts an evening request on the Pacific calendar day, not the UTC one', () => {
    const s = formatPacific('2026-09-03T03:30:00Z')
    expect(s).toContain('Sep 2, 2026')
    expect(s).toContain('8:30 PM')
    expect(s).not.toContain('UTC')
  })

  it('says so for a bad date rather than printing "Invalid Date"', () => {
    expect(formatPacific('not a date')).toBe('unknown time')
  })
})

describe('helpers', () => {
  it('adminRecipients lowercases, trims, de-dupes and drops blanks', () => {
    expect(adminRecipients([{ email: ' Owner@Example.com ' }, { email: 'owner@example.com' }, { email: null }, {}]))
      .toEqual(['owner@example.com'])
    expect(adminRecipients(null)).toEqual([])
  })

  it('escapeLikePattern neutralises _ and % so an address matches only itself', () => {
    expect(escapeLikePattern('first_last%x@example.com')).toBe('first\\_last\\%x@example.com')
  })

  it('indexAccountsByEmail matches a mixed-case profile email', () => {
    const idx = indexAccountsByEmail([{ id: 1, email: 'Pia@Example.COM' }, { id: 2, email: null }])
    expect(idx['pia@example.com'].id).toBe(1)
    expect(Object.keys(idx)).toEqual(['pia@example.com'])
  })

  it('shouldAlertAccessRequest: new access request only', () => {
    expect(shouldAlertAccessRequest({ inserted: [{ email: REQUESTER }], source: 'waitlist' })).toBe(true)
    expect(shouldAlertAccessRequest({ inserted: [{ email: REQUESTER }], source: 'landing' })).toBe(true)
    expect(shouldAlertAccessRequest({ inserted: [], source: 'waitlist' })).toBe(false)
    expect(shouldAlertAccessRequest({ inserted: null, source: 'waitlist' })).toBe(false)
    expect(shouldAlertAccessRequest({ inserted: [{ email: REQUESTER }], source: 'blog' })).toBe(false)
    expect(shouldAlertAccessRequest({ inserted: [{ email: REQUESTER }], source: null })).toBe(false)
  })
})

describe('describeAccount — never reassuring when it cannot tell', () => {
  it('a failed lookup says UNKNOWN, not "no account"', () => {
    expect(describeAccount({ ok: false, account: null })).toMatch(/^UNKNOWN/)
  })
  it('no account means they are waiting', () => {
    expect(describeAccount({ ok: true, account: null })).toMatch(/waiting on you/)
  })
  it('an account with access needs nothing', () => {
    expect(describeAccount({ ok: true, account: { role: 'parent', access_granted: true, access_code_used: 'somecode' } }))
      .toMatch(/Already has a parent account with access \(joined with code "somecode"\)/)
  })
  it('an account with NO access is stuck at the code screen — still needs a code', () => {
    expect(describeAccount({ ok: true, account: { role: 'student', access_granted: false, age_bracket: '13plus' } }))
      .toMatch(/NO access yet.*Send them a code/)
  })
  it('an under-13 account is held for a parent, not a code', () => {
    expect(describeAccount({ ok: true, account: { role: 'student', access_granted: false, age_bracket: 'under13' } }))
      .toMatch(/UNDER 13/)
  })
})

describe('notifyOnSubscribe — Part 1: the admin hears about every NEW access request', () => {
  it('a new waitlist request acks the requester AND sends exactly one admin alert', async () => {
    const svc = world()
    const sendAck = vi.fn(async () => true)
    const sendAlert = vi.fn(async () => true)
    const res = await notifyOnSubscribe({
      email: REQUESTER, source: 'waitlist', inserted: [{ email: REQUESTER }],
      service: svc, sendAck, sendAlert, now: NOW, siteUrl: 'https://www.example.com',
    })

    expect(res).toEqual({ ack: 'sent', alert: 'sent' })
    expect(sendAck).toHaveBeenCalledTimes(1)
    expect(sendAck).toHaveBeenCalledWith({ to: REQUESTER })
    expect(sendAlert).toHaveBeenCalledTimes(1)

    const { to, subject, text } = sendAlert.mock.calls[0][0]
    expect(to).toEqual([ADMIN]) // resolved from role='admin', not hardcoded
    expect(subject).toBe(`BrainScribe: new access request from ${REQUESTER}`)
    expect(text).toContain(`Email:    ${REQUESTER}`)
    expect(text).toContain('Sep 2, 2026')
    expect(text).toContain('3:14 PM PDT')
    expect(text).toContain('Source:   waitlist form')
    expect(text).toContain('None yet. They are waiting on you.')
    expect(text).toContain('Reply:    Sent')
    expect(text).toContain('https://www.example.com/admin?tab=tools#waitlist')
  })

  it('the ack goes out BEFORE the admin alert, so the alert can report it', async () => {
    const order = []
    await notifyOnSubscribe({
      email: REQUESTER, source: 'waitlist', inserted: [{ email: REQUESTER }], service: world(),
      sendAck: async () => { order.push('ack'); return true },
      sendAlert: async () => { order.push('alert'); return true },
      now: NOW,
    })
    expect(order).toEqual(['ack', 'alert'])
  })

  it('a RE-SUBMIT (nothing inserted) sends nothing at all and touches no table', async () => {
    const svc = world()
    const sendAck = vi.fn(async () => true)
    const sendAlert = vi.fn(async () => true)
    const res = await notifyOnSubscribe({
      email: REQUESTER, source: 'waitlist', inserted: [], service: svc, sendAck, sendAlert, now: NOW,
    })
    expect(res).toEqual({ ack: 'skipped_existing', alert: 'skipped_existing' })
    expect(sendAck).not.toHaveBeenCalled()
    expect(sendAlert).not.toHaveBeenCalled()
    expect(svc.calls).toHaveLength(0)
  })

  it('a blog-only signup sends neither the ack nor an admin alert', async () => {
    const svc = world()
    const sendAck = vi.fn(async () => true)
    const sendAlert = vi.fn(async () => true)
    const res = await notifyOnSubscribe({
      email: REQUESTER, source: 'blog', inserted: [{ email: REQUESTER }], service: svc, sendAck, sendAlert, now: NOW,
    })
    expect(res).toEqual({ ack: 'not_applicable', alert: 'not_access_request' })
    expect(sendAck).not.toHaveBeenCalled()
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it('zero admin recipients logs LOUDLY and sends nothing — never a quiet skip', async () => {
    const sendAlert = vi.fn(async () => true)
    const res = await notifyOnSubscribe({
      email: REQUESTER, source: 'waitlist', inserted: [{ email: REQUESTER }],
      service: world({ admins: [] }), sendAck: async () => true, sendAlert, now: NOW,
    })
    expect(res.alert).toBe('no_admins')
    expect(sendAlert).not.toHaveBeenCalled()
    expect(loggedLoudly(/ZERO admin recipients/)).toBe(true)
  })

  it('an admin row with a NULL email counts as zero recipients, loudly', async () => {
    const sendAlert = vi.fn(async () => true)
    const res = await notifyOnSubscribe({
      email: REQUESTER, source: 'waitlist', inserted: [{ email: REQUESTER }],
      service: world({ admins: [{ email: null }] }), sendAck: async () => true, sendAlert, now: NOW,
    })
    expect(res.alert).toBe('no_admins')
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it('a failed admin lookup logs loudly and does not pretend to have sent', async () => {
    const sendAlert = vi.fn(async () => true)
    const res = await notifyOnSubscribe({
      email: REQUESTER, source: 'waitlist', inserted: [{ email: REQUESTER }],
      service: world({ adminErr: { message: 'boom' } }), sendAck: async () => true, sendAlert, now: NOW,
    })
    expect(res.alert).toBe('lookup_failed')
    expect(sendAlert).not.toHaveBeenCalled()
    expect(loggedLoudly(/admin lookup FAILED/)).toBe(true)
  })

  it('a failed send (Resend down / key unset) is reported, not swallowed', async () => {
    const res = await notifyOnSubscribe({
      email: REQUESTER, source: 'waitlist', inserted: [{ email: REQUESTER }],
      service: world(), sendAck: async () => true, sendAlert: async () => false, now: NOW,
    })
    expect(res.alert).toBe('send_failed')
    expect(loggedLoudly(/admin alert NOT sent/)).toBe(true)
  })

  it('a send that THROWS is caught and reported the same way', async () => {
    const res = await notifyOnSubscribe({
      email: REQUESTER, source: 'waitlist', inserted: [{ email: REQUESTER }],
      service: world(), sendAck: async () => true, sendAlert: async () => { throw new Error('network') }, now: NOW,
    })
    expect(res.alert).toBe('send_failed')
  })

  // A broken ack path is the second silent failure: the requester hears nothing AND
  // nobody knows. The admin alert still goes out, and says so in so many words.
  it('a failed ack still alerts the admin, and the alert says they heard NOTHING', async () => {
    const sendAlert = vi.fn(async () => true)
    const res = await notifyOnSubscribe({
      email: REQUESTER, source: 'waitlist', inserted: [{ email: REQUESTER }],
      service: world(), sendAck: async () => false, sendAlert, now: NOW,
    })
    expect(res).toEqual({ ack: 'failed', alert: 'sent' })
    expect(sendAlert.mock.calls[0][0].text).toMatch(/Reply:\s+FAILED.*heard NOTHING/)
    expect(loggedLoudly(/waitlist ack NOT sent/)).toBe(true)
  })

  it('a "landing" access request alerts the admin but gets no ack (unchanged), and the alert says so', async () => {
    const sendAck = vi.fn(async () => true)
    const sendAlert = vi.fn(async () => true)
    const res = await notifyOnSubscribe({
      email: REQUESTER, source: 'landing', inserted: [{ email: REQUESTER }],
      service: world(), sendAck, sendAlert, now: NOW,
    })
    expect(res).toEqual({ ack: 'not_applicable', alert: 'sent' })
    expect(sendAck).not.toHaveBeenCalled()
    expect(sendAlert.mock.calls[0][0].text).toContain('Reply:    None')
  })

  it('names an address that already has an account in the subject', async () => {
    const sendAlert = vi.fn(async () => true)
    await notifyOnSubscribe({
      email: REQUESTER, source: 'waitlist', inserted: [{ email: REQUESTER }],
      service: world({ accounts: [{ email: 'Asker@Example.com', role: 'parent', access_granted: true, access_code_used: 'somecode' }] }),
      sendAck: async () => true, sendAlert, now: NOW,
    })
    const { subject, text } = sendAlert.mock.calls[0][0]
    expect(subject).toBe(`BrainScribe: access request from ${REQUESTER} (already has an account)`)
    expect(text).toMatch(/Already has a parent account with access/)
  })

  it('an account lookup failure still alerts, and says UNKNOWN', async () => {
    const sendAlert = vi.fn(async () => true)
    const res = await notifyOnSubscribe({
      email: REQUESTER, source: 'waitlist', inserted: [{ email: REQUESTER }],
      service: world({ accountErr: { message: 'timeout' } }), sendAck: async () => true, sendAlert, now: NOW,
    })
    expect(res.alert).toBe('sent')
    expect(sendAlert.mock.calls[0][0].text).toContain('Account:  UNKNOWN')
  })
})

describe('findAccountByEmail — request shape and exact match', () => {
  it('queries profiles with an ESCAPED ilike and keeps only the exact lowercased match', async () => {
    const svc = world({ accounts: [
      { email: 'firstxlast@example.com', role: 'student' }, // what an unescaped `_` would also match
      { email: 'First_Last@Example.com', role: 'parent' },
    ] })
    const { ok, account } = await findAccountByEmail(svc, 'first_last@example.com')
    expect(ok).toBe(true)
    expect(account.role).toBe('parent')
    const q = svc.calls.find(isAccountLookup)
    expect(has(q, 'ilike', 'email', 'first\\_last@example.com')).toBe(true)
  })

  it('a wildcard-only candidate is NOT reported as the account', async () => {
    const svc = world({ accounts: [{ email: 'firstxlast@example.com', role: 'student' }] })
    expect((await findAccountByEmail(svc, 'first_last@example.com')).account).toBeNull()
  })
})

describe('alertAdmins — recipient convention', () => {
  it('reads profiles with role=admin and a non-null email', async () => {
    const svc = world({ admins: [{ email: ADMIN }, { email: 'Second@Example.com' }] })
    const send = vi.fn(async () => true)
    const res = await alertAdmins({ service: svc, subject: 's', text: 't', send })
    expect(res).toEqual({ sent: true, reason: 'sent', to: [ADMIN, 'second@example.com'] })
    const q = svc.calls.find(isAdminLookup)
    expect(has(q, 'select', 'email')).toBe(true)
    expect(has(q, 'not', 'email', 'is', null)).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('notifyNewAccount — Part 2: a new account alerts once, with role and code', () => {
  it('sends one alert with email, role, code, access and SF time', async () => {
    const sendAlert = vi.fn(async () => true)
    const res = await notifyNewAccount({
      service: world({ waitlist: { email: REQUESTER, source: 'waitlist', created_at: '2026-09-02T22:14:00Z' } }),
      email: REQUESTER, role: 'parent', ageBracket: '13plus', accessCode: 'somecode', accessGranted: true,
      sendAlert, now: new Date('2026-09-20T17:05:00Z'), siteUrl: 'https://www.example.com',
    })
    expect(res.alert).toBe('sent')
    expect(sendAlert).toHaveBeenCalledTimes(1)
    const { to, subject, text } = sendAlert.mock.calls[0][0]
    expect(to).toEqual([ADMIN])
    expect(subject).toBe(`BrainScribe: new parent signup — ${REQUESTER}`)
    expect(text).toContain('Role:         parent')
    expect(text).toContain('Access code:  somecode')
    expect(text).toContain('Access:       Granted.')
    expect(text).toContain('10:05 AM PDT')
    expect(text).toContain('On waitlist:  yes — asked Wed, Sep 2, 2026, 3:14 PM PDT')
    expect(text).toContain('https://www.example.com/admin?tab=parents')
  })

  it('an under-13 signup is labelled as held for a parent', async () => {
    const sendAlert = vi.fn(async () => true)
    await notifyNewAccount({
      service: world(), email: REQUESTER, role: 'student', ageBracket: 'under13',
      accessCode: null, accessGranted: false, sendAlert, now: NOW,
    })
    const { subject, text } = sendAlert.mock.calls[0][0]
    expect(subject).toContain('new under-13 student signup')
    expect(text).toContain('Access code:  none')
    expect(text).toMatch(/Held — under 13/)
    expect(text).toContain('On waitlist:  no')
  })

  it('unknown access (profile read failed) says UNKNOWN, not "not granted"', () => {
    const { text } = buildNewAccountAlert({ email: REQUESTER, role: 'student', accessGranted: undefined, at: NOW })
    expect(text).toMatch(/Access:\s+UNKNOWN/)
  })

  it('zero admins logs loudly', async () => {
    const sendAlert = vi.fn(async () => true)
    const res = await notifyNewAccount({
      service: world({ admins: [] }), email: REQUESTER, role: 'student', accessGranted: true, sendAlert, now: NOW,
    })
    expect(res.alert).toBe('no_admins')
    expect(sendAlert).not.toHaveBeenCalled()
    expect(loggedLoudly(/ZERO admin recipients/)).toBe(true)
  })

  it('an account with no email is reported, not skipped quietly', async () => {
    const sendAlert = vi.fn(async () => true)
    const res = await notifyNewAccount({ service: world(), email: null, role: 'student', sendAlert, now: NOW })
    expect(res.alert).toBe('no_email')
    expect(sendAlert).not.toHaveBeenCalled()
    expect(loggedLoudly(/no email on the account/)).toBe(true)
  })
})

describe('buildAccessRequestAlert', () => {
  it('falls back to the production site when no site URL is configured', () => {
    const { text } = buildAccessRequestAlert({ email: REQUESTER, source: 'waitlist', at: NOW, lookup: { ok: true, account: null } })
    expect(text).toContain('https://www.brainscribe.io/admin?tab=tools#waitlist')
  })
})

// The real Resend sender, with fetch stubbed — proves the request shape without
// sending anything.
describe('sendAdminAlert (lib/notifications.js)', () => {
  const realKey = process.env.RESEND_API_KEY
  afterEach(() => {
    vi.unstubAllGlobals()
    if (realKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = realKey
  })

  it('returns false and calls nothing when the key is unset', async () => {
    delete process.env.RESEND_API_KEY
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { sendAdminAlert } = await import('./notifications.js')
    expect(await sendAdminAlert({ to: [ADMIN], subject: 's', text: 't' })).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts a plain-text email to Resend from the notifications address', async () => {
    process.env.RESEND_API_KEY = 'test-key-not-real'
    const fetchSpy = vi.fn(async () => ({ ok: true, text: async () => '' }))
    vi.stubGlobal('fetch', fetchSpy)
    const { sendAdminAlert } = await import('./notifications.js')
    expect(await sendAdminAlert({ to: [ADMIN], subject: 'Subj', text: 'Body' })).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(JSON.parse(init.body)).toEqual({
      from: 'BrainScribe <notifications@brainscribe.io>', to: [ADMIN], subject: 'Subj', text: 'Body',
    })
  })

  it('returns false on a Resend error', async () => {
    process.env.RESEND_API_KEY = 'test-key-not-real'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, text: async () => 'bad' })))
    const { sendAdminAlert } = await import('./notifications.js')
    expect(await sendAdminAlert({ to: [ADMIN], subject: 's', text: 't' })).toBe(false)
  })
})

// The routes are where an alert silently never fires: the helper can be perfect and
// simply not be called, or be called on every request. Asserted at the source level
// (same reason as lib/wiring.test.js — no type checker, no route harness).
describe('wiring', () => {
  const ROOT = join(import.meta.dirname, '..')
  const read = f => readFileSync(join(ROOT, f), 'utf8')

  it('/api/subscribe calls notifyOnSubscribe inside after(), gated on inserted rows, with both senders', () => {
    const src = read('app/api/subscribe/route.js')
    expect(src).toMatch(/if \(inserted\?\.length\) \{\s*after\(async \(\) => \{[\s\S]*?notifyOnSubscribe\(\{/)
    expect(src).toMatch(/sendAck: sendWaitlistAck, sendAlert: sendAdminAlert/)
    expect(src).toMatch(/ignoreDuplicates: true \}\)\s*\.select\('email'\)/)
    // The old direct ack must be gone, or a new request would be acked twice.
    expect(src).not.toMatch(/await sendWaitlistAck\(/)
  })

  it('/api/profile/confirm-role alerts only when ITS conditional update flipped role_confirmed', () => {
    const src = read('app/api/profile/confirm-role/route.js')
    expect(src).toMatch(/\.or\('role_confirmed\.is\.null,role_confirmed\.eq\.false'\)\s*\.select\('id'\)/)
    expect(src).toMatch(/const firstConfirm = !firstErr && \(firstRows\?\.length \?\? 0\) > 0/)
    expect(src).toMatch(/if \(firstConfirm\) \{\s*after\(async \(\) => \{[\s\S]*?notifyNewAccount\(\{/)
    expect(src.match(/notifyNewAccount\(/g)).toHaveLength(1)
    // The COPPA sticky-check select must stay exactly as it was — alert fields are read
    // separately so a column problem there can never null `existing`.
    expect(src).toContain(".select('age_bracket, coppa_consent_required, coppa_consent_given')\n")
  })

  it('/api/admin/waitlist matches accounts case-insensitively and fails loudly on a lookup error', () => {
    const src = read('app/api/admin/waitlist/route.js')
    expect(src).toMatch(/indexAccountsByEmail\(profiles\)/)
    expect(src).not.toMatch(/^\s*\.in\('email'/m) // code, not the comment explaining why
    expect(src).toMatch(/throw new Error\(`account lookup failed/)
  })
})

// "Reproduce the REAL request shape" (CLAUDE.md). The fakes above prove the decisions;
// this proves the requests the real supabase-js builds for the two new queries, with a
// capturing fetch — nothing leaves the process. What it cannot prove is that the live
// PostgREST accepts them; confirm-role falls back to the plain update if it does not.
describe('request shape (real supabase-js, captured fetch)', () => {
  async function capture(run) {
    const { createClient } = await import('@supabase/supabase-js')
    const seen = []
    const client = createClient('https://example.supabase.co', 'service-key-not-real', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (url, init) => {
          seen.push({ url: String(url), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: init?.body })
          return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
        },
      },
    })
    await run(client)
    return seen
  }

  it('confirm-role first-confirm: PATCH filtered on id AND role_confirmed false/null, returning id', async () => {
    const [req] = await capture(c => c.from('profiles')
      .update({ role: 'parent', role_confirmed: true })
      .eq('id', 'u1')
      .or('role_confirmed.is.null,role_confirmed.eq.false')
      .select('id'))
    expect(req.method).toBe('PATCH')
    const u = new URL(req.url)
    expect(u.pathname).toBe('/rest/v1/profiles')
    expect(u.searchParams.get('id')).toBe('eq.u1')
    expect(u.searchParams.get('or')).toBe('(role_confirmed.is.null,role_confirmed.eq.false)')
    expect(u.searchParams.get('select')).toBe('id')
    // Without return=representation the body is empty and EVERY call would read as
    // "not the first" — the alert would silently never fire.
    expect(req.headers.get('prefer')).toMatch(/return=representation/)
  })

  it('account lookup: GET profiles with an escaped ilike on email', async () => {
    const [req] = await capture(c => findAccountByEmail(c, 'First_Last@example.com'))
    expect(req.method).toBe('GET')
    const u = new URL(req.url)
    expect(u.pathname).toBe('/rest/v1/profiles')
    expect(u.searchParams.get('email')).toBe('ilike.first\\_last@example.com')
  })

  it('admin lookup: role=admin and email not null', async () => {
    const reqs = await capture(c => alertAdmins({ service: c, subject: 's', text: 't', send: async () => true }))
    const u = new URL(reqs[0].url)
    expect(u.searchParams.get('role')).toBe('eq.admin')
    expect(u.searchParams.get('email')).toBe('not.is.null')
  })
})
