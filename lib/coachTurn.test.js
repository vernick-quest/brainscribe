import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  FIRST_TEXT_TIMEOUT_MS, STALL_TIMEOUT_MS,
  createTurnWatchdog, classifyTurnFailure, turnExit, turnFailureMessage, createRetrySlot, runCoachTurn,
} from './coachTurn'

// Synthetic fixtures only (public repo). The "student words" in a [DONE:] are invented.

const flush = async () => { for (let i = 0; i < 30; i++) await null }
function deferred() {
  let resolve, reject
  const p = new Promise((res, rej) => { resolve = res; reject = rej })
  return { p, resolve, reject }
}
const abortError = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })

function clock() {
  let t = 0, id = 0
  const timers = new Map()
  return {
    now: () => t,
    schedule: (fn, ms) => { const k = ++id; timers.set(k, { at: t + ms, fn }); return k },
    clear: (k) => { timers.delete(k) },
    get armed() { return timers.size },
    async advance(ms) {
      const target = t + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, v]) => v.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0]); t = due[1].at; due[1].fn(); await flush()
      }
      t = target
      await flush()
    },
  }
}

// A response body the test feeds by hand. Like fetch's, it errors when the request aborts —
// unless `honorAbort` is false, which models a stream that closes in the same instant the
// watchdog fires (the read already resolved before the abort could error it).
function body({ honorAbort = true } = {}) {
  const enc = new TextEncoder()
  const queue = []
  let closed = false, error = null, waiting = null
  const settle = () => {
    if (!waiting) return
    const w = waiting
    if (queue.length) { waiting = null; w.resolve({ done: false, value: queue.shift() }) }
    else if (error) { waiting = null; w.reject(error) }
    else if (closed) { waiting = null; w.resolve({ done: true, value: undefined }) }
  }
  return {
    push(text) { queue.push(enc.encode(text)); settle() },
    close() { closed = true; settle() },
    abort() { if (honorAbort && !closed) { error = abortError(); settle() } },
    reader: {
      read() { const d = deferred(); waiting = d; settle(); return d.p },
      cancel() { return Promise.resolve() },
    },
  }
}

// One turn wired the way TutorSession wires it, with every callback recorded.
function turn({ c, status = 200, honorAbort = true, headersNow = true, applyThrows = false, counters = null } = {}) {
  const b = body({ honorAbort })
  const headers = deferred()
  const calls = { chunks: [], owns: [], streamEnd: [], applied: [], failures: [], aborted: 0, headers: 0 }
  const ctr = counters ?? { turn: 1 }
  const myTurn = ctr.turn
  let mounted = true
  const res = {
    ok: status >= 200 && status < 300, status,
    text: async () => 'server said no',
    body: { getReader: () => b.reader },
  }
  const done = runCoachTurn({
    myTurn,
    currentTurn: () => ctr.turn,
    isMounted: () => mounted,
    request: (signal) => {
      signal.addEventListener('abort', () => { calls.aborted++; headers.reject(abortError()); b.abort() })
      if (headersNow) headers.resolve(res)
      return headers.p
    },
    onHeaders: () => { calls.headers++ },
    onChunk: (full, owns) => { calls.chunks.push(full); calls.owns.push(owns) },
    onStreamEnd: (full) => { calls.streamEnd.push(full) },
    apply: async (full, ownsUi) => { calls.applied.push({ full, ownsUi: ownsUi() }); if (applyThrows) throw new Error('parse blew up') },
    onFailure: (f) => { calls.failures.push(f) },
    watchdog: { schedule: c.schedule, clear: c.clear },
    log: { error: () => {}, warn: () => {} },
  })
  return { b, headers, res, calls, done, ctr, unmount: () => { mounted = false } }
}

const REPLY = 'Okay, that bus stop detail matters. [DONE:hook:The bus stop smelled like rain and diesel.] What next?'

// ── The constants ─────────────────────────────────────────────────────────────────

describe('timeouts — generous enough for a slow-but-healthy reply', () => {
  it('first-text and stall limits are 45s, ~6× the new model\'s p90 to first word (7.6s)', () => {
    expect(FIRST_TEXT_TIMEOUT_MS).toBe(45_000)
    expect(STALL_TIMEOUT_MS).toBe(45_000)
    expect(FIRST_TEXT_TIMEOUT_MS).toBeGreaterThan(7_600 * 5)
  })
})

// ── Watchdog ──────────────────────────────────────────────────────────────────────

describe('createTurnWatchdog', () => {
  it('fires once if no bytes arrive in time, and marks the turn aborted', async () => {
    const c = clock(); const fired = []
    const wd = createTurnWatchdog({ onTimeout: k => fired.push(k), schedule: c.schedule, clear: c.clear })
    wd.start()
    await c.advance(FIRST_TEXT_TIMEOUT_MS - 1); expect(fired).toEqual([])
    await c.advance(1); expect(fired).toEqual(['first-text'])
    expect(wd.aborted).toBe(true); expect(wd.timedOut).toBe(true)
    expect(wd.finish()).toBe(false)
  })
  it('each chunk resets the stall timer; there is no cap on total length', async () => {
    const c = clock(); const fired = []
    const wd = createTurnWatchdog({ onTimeout: k => fired.push(k), schedule: c.schedule, clear: c.clear })
    wd.start()
    await c.advance(FIRST_TEXT_TIMEOUT_MS - 100); wd.chunk()
    for (let i = 0; i < 20; i++) { await c.advance(STALL_TIMEOUT_MS - 1); wd.chunk() }   // ~15 minutes, healthy
    expect(fired).toEqual([])
    await c.advance(STALL_TIMEOUT_MS); expect(fired).toEqual(['stall'])
  })
  it('finish() disarms: nothing fires later, and the turn may apply', async () => {
    const c = clock(); const fired = []
    const wd = createTurnWatchdog({ onTimeout: k => fired.push(k), schedule: c.schedule, clear: c.clear })
    wd.start(); wd.chunk()
    expect(wd.finish()).toBe(true)
    await c.advance(10 * STALL_TIMEOUT_MS)
    expect(fired).toEqual([]); expect(c.armed).toBe(0)
  })
})

describe('classifyTurnFailure / turnFailureMessage / turnExit', () => {
  it('classifies', () => {
    expect(classifyTurnFailure({ outcome: 'ok' })).toBe(null)
    expect(classifyTurnFailure({ outcome: 'http', status: 500 })).toBe('error')
    expect(classifyTurnFailure({ outcome: 'http', status: 429 })).toBe('rate-limited')
    expect(classifyTurnFailure({ outcome: 'error' })).toBe('error')
    expect(classifyTurnFailure({ outcome: 'error', timedOut: true })).toBe('timeout')   // the AbortError is a timeout
  })
  it('gentle copy, names the coach, never blames the student', () => {
    expect(turnFailureMessage('timeout')).toBe('That took too long — tap to try again.')
    expect(turnFailureMessage('error', 'Owen')).toBe("Owen couldn't answer just then — tap to try again.")
    expect(turnFailureMessage('rate-limited')).toMatch(/few seconds/)
    for (const f of ['timeout', 'error', 'rate-limited']) expect(turnFailureMessage(f, 'Owen')).not.toMatch(/\byou\b.*(wrong|fault)/i)
  })
  it('the UI belongs to the newest TURN; unmounted → nobody', () => {
    expect(turnExit({ myTurn: 3, currentTurn: 3, failure: 'error' })).toEqual({ ownsUi: true, offerRetry: true })
    expect(turnExit({ myTurn: 3, currentTurn: 4, failure: 'error' })).toEqual({ ownsUi: false, offerRetry: false })
    expect(turnExit({ myTurn: 3, currentTurn: 3, mounted: false, failure: 'error' }).ownsUi).toBe(false)
    expect(turnExit({ myTurn: 3, currentTurn: 3, failure: null })).toEqual({ ownsUi: true, offerRetry: false })
  })
})

describe('createRetrySlot — a double tap cannot send twice', () => {
  it('hands the request back exactly once', () => {
    const s = createRetrySlot(); const req = { history: ['x'] }
    s.offer(req)
    expect(s.take()).toBe(req)
    expect(s.take()).toBe(null)
  })
  it('a new turn clears a stale offer', () => {
    const s = createRetrySlot(); s.offer({}); s.clear(); expect(s.take()).toBe(null)
  })
})

// ── runCoachTurn: every exit path ─────────────────────────────────────────────────

describe('runCoachTurn — success', () => {
  it('streams, then applies exactly once; the watchdog is disarmed afterwards', async () => {
    const c = clock(); const t = turn({ c })
    await flush()
    t.b.push('Okay, that bus stop '); await flush()
    t.b.push(REPLY.slice(20)); t.b.close()
    const r = await t.done
    expect(r).toEqual({ outcome: 'ok', failure: null, applied: true })
    expect(t.calls.applied).toEqual([{ full: REPLY, ownsUi: true }])
    expect(t.calls.streamEnd).toEqual([REPLY])
    expect(t.calls.failures).toEqual([])
    await c.advance(10 * STALL_TIMEOUT_MS)
    expect(t.calls.aborted).toBe(0)
  })

  it('a slow-but-HEALTHY reply is never cut: headers at 30s, first bytes at 44.9s, a 40s gap mid-stream', async () => {
    const c = clock(); const t = turn({ c, headersNow: false })
    await c.advance(30_000); t.headers.resolve(t.res); await flush()
    await c.advance(14_900); t.b.push('Okay, that bus stop detail matters. '); await flush()
    await c.advance(40_000); t.b.push('What did it feel like?'); await flush()
    await c.advance(1_000); t.b.close()
    expect((await t.done).outcome).toBe('ok')
    expect(t.calls.aborted).toBe(0)
  })
})

describe('runCoachTurn — ordering', () => {
  it('flushes speech BEFORE apply (the scaffold parse can await a network PATCH)', async () => {
    const c = clock(); const order = []
    const b = body()
    const res = { ok: true, status: 200, body: { getReader: () => b.reader } }
    const p = runCoachTurn({
      myTurn: 1, currentTurn: () => 1, request: async () => res,
      onChunk: () => order.push('chunk'), onStreamEnd: () => order.push('end'),
      apply: async () => { order.push('apply') },
      watchdog: { schedule: c.schedule, clear: c.clear }, log: { error() {}, warn() {} },
    })
    await flush(); b.push('Hi. '); await flush(); b.close()
    await p
    expect(order).toEqual(['chunk', 'end', 'apply'])
  })
})

describe('runCoachTurn — failures always hand the UI back (no stuck "thinking")', () => {
  it('HTTP 500 → error, owns the UI, retry offered, nothing applied', async () => {
    const c = clock(); const t = turn({ c, status: 500 })
    const r = await t.done
    expect(r.failure).toBe('error')
    expect(t.calls.failures).toEqual([{ failure: 'error', ownsUi: true, offerRetry: true, sawBytes: false, partial: '' }])
    expect(t.calls.applied).toEqual([])
  })

  it('HTTP 429 → rate-limited', async () => {
    const c = clock(); const t = turn({ c, status: 429 })
    expect((await t.done).failure).toBe('rate-limited')
  })

  it('network error → error', async () => {
    const c = clock(); const ctr = { turn: 1 }
    const failures = []
    const r = await runCoachTurn({
      myTurn: 1, currentTurn: () => ctr.turn, request: () => Promise.reject(new TypeError('Failed to fetch')),
      onFailure: f => failures.push(f), watchdog: { schedule: c.schedule, clear: c.clear }, log: { error() {}, warn() {} },
    })
    expect(r.failure).toBe('error')
    expect(failures[0].ownsUi).toBe(true)
  })

  it('no response at all within 45s → aborted, TIMEOUT, retry offered', async () => {
    const c = clock(); const t = turn({ c, headersNow: false })
    await c.advance(FIRST_TEXT_TIMEOUT_MS)
    const r = await t.done
    expect(t.calls.aborted).toBe(1)
    expect(r.failure).toBe('timeout')
    expect(t.calls.failures).toEqual([{ failure: 'timeout', ownsUi: true, offerRetry: true, sawBytes: false, partial: '' }])
  })

  it('headers but no first text within 45s of the SEND → timeout', async () => {
    const c = clock(); const t = turn({ c })
    await c.advance(FIRST_TEXT_TIMEOUT_MS)
    expect((await t.done).failure).toBe('timeout')
    expect(t.calls.headers).toBe(1)
  })

  it('REPLAY-THEN-FAIL (the reported bug): the audio run moved on, the turn did not → this turn still resets the UI', async () => {
    const c = clock()
    const counters = { turn: 1, audio: 1 }
    const t = turn({ c, status: 500, counters, headersNow: false })
    counters.audio++                  // Replay / the student speaking bumps ONLY the audio run
    t.headers.resolve(t.res)
    await t.done
    expect(t.calls.failures[0]).toMatchObject({ ownsUi: true, offerRetry: true })
  })

  it('a NEWER turn already started → the old failure leaves the UI to it (no reopened Send under it)', async () => {
    const c = clock(); const counters = { turn: 1 }
    const t = turn({ c, status: 500, counters, headersNow: false })
    counters.turn = 2
    t.headers.resolve(t.res)
    await t.done
    expect(t.calls.failures[0]).toMatchObject({ failure: 'error', ownsUi: false, offerRetry: false })
  })

  it('after unmount, a failure touches nothing', async () => {
    const c = clock(); const t = turn({ c, status: 500, headersNow: false })
    t.unmount(); t.headers.resolve(t.res)
    await t.done
    expect(t.calls.failures[0].ownsUi).toBe(false)
  })

  it('apply throwing still hands the UI back', async () => {
    const c = clock(); const t = turn({ c, applyThrows: true })
    t.b.push(REPLY); t.b.close()
    const r = await t.done
    expect(r.failure).toBe('error')
    expect(t.calls.failures[0].ownsUi).toBe(true)
  })

  it('onFailure is called exactly once per failed turn', async () => {
    const c = clock(); const t = turn({ c, headersNow: false })
    await c.advance(FIRST_TEXT_TIMEOUT_MS)
    await c.advance(10 * FIRST_TEXT_TIMEOUT_MS)
    await t.done
    expect(t.calls.failures.length).toBe(1)
  })
})

describe('runCoachTurn — an aborted turn can never apply its tokens', () => {
  it('stall mid-stream → aborted; a [DONE:] that "arrives" afterwards is never applied', async () => {
    const c = clock(); const t = turn({ c })
    t.b.push('Okay, that bus stop detail '); await flush()
    await c.advance(STALL_TIMEOUT_MS)
    t.b.push('matters. [DONE:hook:The bus stop smelled like rain and diesel.]'); t.b.close()
    const r = await t.done
    expect(r.failure).toBe('timeout')
    expect(t.calls.applied).toEqual([])
    expect(t.calls.streamEnd).toEqual([])
    expect(t.calls.failures[0]).toMatchObject({ failure: 'timeout', sawBytes: true, partial: 'Okay, that bus stop detail ' })
  })

  it('hands onFailure the partial text (so a [CARE] that already arrived is not swallowed), still applying nothing', async () => {
    const c = clock(); const t = turn({ c })
    t.b.push("I'm really glad you told me. [CARE] "); await flush()
    await c.advance(STALL_TIMEOUT_MS)
    await t.done
    expect(t.calls.failures[0].partial).toContain('[CARE]')
    expect(t.calls.applied).toEqual([])
  })

  it('the stream closes in the SAME instant the watchdog fires (abort could not error the read) → still not applied', async () => {
    const c = clock(); const t = turn({ c, honorAbort: false })
    t.b.push('Okay, that bus stop detail '); await flush()
    await c.advance(STALL_TIMEOUT_MS)           // watchdog fires; this body ignores the abort…
    t.b.push('matters. [DONE:hook:The bus stop smelled like rain and diesel.]'); t.b.close()   // …and completes
    const r = await t.done
    expect(t.calls.applied).toEqual([])
    expect(r.failure).toBe('timeout')
  })

  it('a SUPERSEDED (not aborted) turn still applies its tokens — dropping them would lose a real lock', async () => {
    const c = clock(); const counters = { turn: 1 }
    const t = turn({ c, counters })
    t.b.push('Okay, '); await flush()
    counters.turn = 2                           // a newer turn started
    t.b.push(REPLY.slice(6)); t.b.close()
    const r = await t.done
    expect(r.outcome).toBe('ok')
    expect(t.calls.applied).toEqual([{ full: REPLY, ownsUi: false }])   // applies, but must not touch the UI
    expect(t.calls.owns).toEqual([true, false])
  })
})

// ── Structural guard on the wiring (TutorSession is not rendered in tests) ────────

describe('TutorSession wiring', () => {
  const src = readFileSync(fileURLToPath(new URL('../components/TutorSession.js', import.meta.url)), 'utf8')
  it('decides UI ownership by the TURN counter, which only askTutor bumps (not the audio run)', () => {
    expect(src).toMatch(/currentTurn:\s*\(\)\s*=>\s*askTurnRef\.current/)
    const bumps = src.match(/\+\+askTurnRef\.current|askTurnRef\.current\s*\+\+|askTurnRef\.current\s*\+=/g) ?? []
    expect(bumps.length).toBe(1)
    expect(src).toMatch(/const myTurn\s*=\s*\+\+askTurnRef\.current/)
  })
})
