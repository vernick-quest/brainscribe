import { describe, it, expect } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ACK_LINES, ACK_DELAY_MS, ACK_MAX_WAIT_MS, ACK_MAX_PLAY_MS, MIN_ACK_GAP_MS,
  ackClipPath, ackPersona, allAckClips, shouldPlayAck, createAckPicker, createAckController,
} from './ackClips'
import { createSpeechStream } from './speechStream'
import { PERSONAS } from './personas'

// Synthetic fixtures only (public repo).

const flush = async () => { for (let i = 0; i < 20; i++) await null }
function deferred() {
  let resolve, reject
  const p = new Promise((res, rej) => { resolve = res; reject = rej })
  return { p, resolve, reject }
}

// A manual clock for the controller's injected timers.
function clock() {
  let t = 0
  let id = 0
  const timers = new Map()
  return {
    now: () => t,
    schedule: (fn, ms) => { const k = ++id; timers.set(k, { at: t + ms, fn }); return k },
    clear: (k) => { timers.delete(k) },
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

// ONE audio element, as in TutorSession: whatever starts playing replaces what was on it.
// Records every overlap (a play starting while another clip is still sounding) and every cut.
function element() {
  const log = []
  let current = null       // { url, d }
  const overlaps = []
  return {
    log, overlaps,
    get current() { return current?.url ?? null },
    play(url) {
      if (current) overlaps.push({ cut: current.url, by: url })
      const d = deferred()
      current = { url, d }
      log.push(`play ${url}`)
      return d.p
    },
    end() {                // the clip on the element reaches its natural end
      const c = current; current = null
      if (c) { log.push(`end ${c.url}`); c.d.resolve() }
    },
    pause() {              // a stop: no `ended` fires, the play promise never settles
      if (current) log.push(`pause ${current.url}`)
      current = null
    },
  }
}

function ackFor(el, c, { loadUrl = 'ack:1', loadDeferred = null, live = () => true } = {}) {
  const revoked = []
  const ack = createAckController({
    load: () => (loadDeferred ? loadDeferred.p : Promise.resolve(loadUrl)),
    play: (url) => el.play(url),
    stopPlayback: () => el.pause(),
    revoke: (u) => revoked.push(u),
    isLive: live,
    schedule: c.schedule, clear: c.clear, now: c.now,
  })
  return { ack, revoked }
}

function speechFor(el, { startAfter = null, synthDeferreds = null } = {}) {
  const synthCalls = []
  const revoked = []
  const s = createSpeechStream({
    synth: (text) => {
      synthCalls.push(text)
      const url = `tts:${synthCalls.length}`
      if (synthDeferreds) { const d = deferred(); synthDeferreds.push({ d, url }); return d.p }
      return Promise.resolve(url)
    },
    play: (url) => el.play(url),
    revoke: (u) => revoked.push(u),
    startAfter,
    warn: () => {},
  })
  return { s, synthCalls, revoked }
}

const REPLY = 'Okay, so that detail about the bus stop is doing a lot of work. What did it feel like standing there?'

// ── The clip set ──────────────────────────────────────────────────────────────────

describe('ACK_LINES — the clip set', () => {
  it('covers exactly the coach personas, 6–10 clips each', () => {
    expect(Object.keys(ACK_LINES).sort()).toEqual(Object.keys(PERSONAS).sort())
    for (const [p, lines] of Object.entries(ACK_LINES)) {
      expect(lines.length, p).toBeGreaterThanOrEqual(6)
      expect(lines.length, p).toBeLessThanOrEqual(10)
      expect(new Set(lines).size, `${p} has a duplicate line`).toBe(lines.length)
    }
  })

  it('never asks a question and never judges the work before the coach has read it', () => {
    const judging = /\b(great|good|nice|love|perfect|awesome|excellent|amazing|well done|brilliant|wow|yes|exactly|true|agree|like that|right on)\b/i
    for (const { persona, text } of allAckClips()) {
      expect(text, `${persona}: "${text}"`).not.toMatch(/\?/)
      expect(text, `${persona}: "${text}"`).not.toMatch(judging)
      expect(text.length, `${persona}: "${text}" is too long to be instant`).toBeLessThanOrEqual(40)
    }
  })

  it('maps persona → asset file the way lib/personas.js does (matilda → tilly)', () => {
    for (const p of Object.keys(ACK_LINES)) {
      expect(ackClipPath(p, 0)).toBe(`/coaches/audio/ack/${PERSONAS[p].asset}-1.mp3`)
    }
    expect(ackClipPath('matilda', 2)).toBe('/coaches/audio/ack/tilly-3.mp3')
    expect(ackPersona('retired-coach')).toBe('owen')
    expect(new Set(allAckClips().map(c => c.path)).size).toBe(allAckClips().length)
  })

  it('every clip is actually on disk in public/ (a missing file would be a silent no-op in the app)', () => {
    const pub = fileURLToPath(new URL('../public', import.meta.url))
    for (const { path } of allAckClips()) {
      const f = pub + path
      expect(existsSync(f), `${path} missing — run scripts/pregen-coach-acks.mjs`).toBe(true)
      expect(statSync(f).size, `${path} is empty`).toBeGreaterThan(2000)
    }
  })
})

// ── When to play ──────────────────────────────────────────────────────────────────

describe('shouldPlayAck — skip rules', () => {
  const base = { turnKind: 'student', voiceOn: true, now: 100_000, lastAckAt: null }

  it('plays on a student turn with the voice on', () => {
    expect(shouldPlayAck(base)).toEqual({ play: true, reason: 'ok' })
  })
  it('skips when the coach voice is muted', () => {
    expect(shouldPlayAck({ ...base, voiceOn: false }).play).toBe(false)
  })
  it.each(['ui-action', 'greeting', 'replay', 'onboarding', undefined])('skips a %s turn', (turnKind) => {
    expect(shouldPlayAck({ ...base, turnKind })).toEqual({ play: false, reason: 'not-a-student-turn' })
  })
  it('skips when the reply is already streaming', () => {
    expect(shouldPlayAck({ ...base, replyStarted: true }).reason).toBe('reply-streaming')
  })
  it('rate-limits: not within MIN_ACK_GAP_MS of the last clip that played', () => {
    expect(shouldPlayAck({ ...base, lastAckAt: base.now - MIN_ACK_GAP_MS + 1 }).reason).toBe('rate-limited')
    expect(shouldPlayAck({ ...base, lastAckAt: base.now - MIN_ACK_GAP_MS }).play).toBe(true)
  })
  it('voice-off wins over everything (no audio of any kind when muted)', () => {
    expect(shouldPlayAck({ turnKind: 'ui-action', voiceOn: false }).reason).toBe('voice-off')
  })
})

// ── Which clip ────────────────────────────────────────────────────────────────────

describe('createAckPicker — random without an immediate repeat', () => {
  it('never picks the same clip twice in a row (real RNG, 5000 picks per persona)', () => {
    const picker = createAckPicker()
    for (const p of Object.keys(ACK_LINES)) {
      let prev = null
      const seen = new Set()
      for (let i = 0; i < 5000; i++) {
        const k = picker.pick(p)
        expect(k).not.toBe(prev)
        expect(k).toBeGreaterThanOrEqual(0)
        expect(k).toBeLessThan(ACK_LINES[p].length)
        seen.add(k); prev = k
      }
      expect(seen.size, `${p}: every clip reachable`).toBe(ACK_LINES[p].length)
    }
  })

  it('holds even with a stuck RNG at either extreme (no rejection loop to spin)', () => {
    for (const r of [0, 0.999999]) {
      const picker = createAckPicker(() => r)
      let prev = null
      for (let i = 0; i < 50; i++) { const k = picker.pick('owen'); expect(k).not.toBe(prev); prev = k }
    }
  })

  it('tracks each persona separately (a coach switch does not constrain the new coach)', () => {
    const picker = createAckPicker(() => 0)
    expect(picker.pick('owen')).toBe(0)
    expect(picker.pick('deon')).toBe(0)
    expect(picker.pick('owen')).not.toBe(0)
  })
})

// ── One turn's controller ─────────────────────────────────────────────────────────

describe('createAckController — one turn', () => {
  it('plays the clip after the delay, and `done` waits for its natural end', async () => {
    const c = clock(); const el = element()
    const { ack, revoked } = ackFor(el, c)
    let done = false; ack.done.then(() => { done = true })
    await c.advance(ACK_DELAY_MS - 1)
    expect(el.current).toBe(null)
    await c.advance(1)
    expect(el.current).toBe('ack:1')
    expect(done).toBe(false)
    el.end(); await flush()
    expect(done).toBe(true)
    expect(ack.outcome).toBe('played')
    expect(revoked).toEqual(['ack:1'])
  })

  it('skips when the reply arrives inside the delay — never plays, url freed', async () => {
    const c = clock(); const el = element()
    const { ack, revoked } = ackFor(el, c)
    await c.advance(ACK_DELAY_MS - 100)
    ack.replyStarted()
    await c.advance(1000)
    expect(el.log).toEqual([])
    expect(ack.outcome).toBe('reply-first')
    expect(revoked).toEqual(['ack:1'])
  })

  it('abandon() (the turn failed): skips a clip that has not started, never cuts one that has', async () => {
    const c = clock(); const el = element()
    const { ack } = ackFor(el, c)
    ack.abandon(); await c.advance(5000)
    expect(el.log).toEqual([])
    expect(ack.outcome).toBe('abandoned')
    const c2 = clock(); const el2 = element()
    const { ack: ack2 } = ackFor(el2, c2)
    await c2.advance(ACK_DELAY_MS)
    ack2.abandon(); await flush()
    expect(el2.log).toEqual(['play ack:1'])
    expect(ack2.pending).toBe(true)
    el2.end(); await flush()
    expect(ack2.outcome).toBe('played')
  })

  it('a reply arriving WHILE the clip plays does not cut it', async () => {
    const c = clock(); const el = element()
    const { ack } = ackFor(el, c)
    await c.advance(ACK_DELAY_MS)
    ack.replyStarted()
    expect(el.current).toBe('ack:1')
    expect(ack.pending).toBe(true)
    el.end(); await flush()
    expect(ack.outcome).toBe('played')
  })

  it('cancel while playing pauses it and resolves `done` at once (no `ended` will ever fire)', async () => {
    const c = clock(); const el = element()
    const { ack } = ackFor(el, c)
    await c.advance(ACK_DELAY_MS)
    let done = false; ack.done.then(() => { done = true })
    ack.cancel(); await flush()
    expect(el.log).toEqual(['play ack:1', 'pause ack:1'])
    expect(done).toBe(true)
    expect(ack.outcome).toBe('cancelled')
  })

  it('cancel before it starts: nothing plays, a late load is revoked', async () => {
    const c = clock(); const el = element(); const ld = deferred()
    const { ack, revoked } = ackFor(el, c, { loadDeferred: ld })
    ack.cancel()
    ld.resolve('ack:late'); await c.advance(5000)
    expect(el.log).toEqual([])
    expect(revoked).toEqual(['ack:late'])
  })

  it('a failed load is silent and releases the reply', async () => {
    const c = clock(); const el = element(); const ld = deferred()
    const { ack } = ackFor(el, c, { loadDeferred: ld })
    ld.reject(new Error('404')); await c.advance(ACK_DELAY_MS)
    expect(el.log).toEqual([])
    expect(ack.outcome).toBe('load-failed')
  })

  it('a slow load is dropped at ACK_MAX_WAIT_MS — a late "Mm, okay" would land on the reply', async () => {
    const c = clock(); const el = element(); const ld = deferred()
    const { ack, revoked } = ackFor(el, c, { loadDeferred: ld })
    await c.advance(ACK_MAX_WAIT_MS)
    expect(ack.outcome).toBe('slow-load')
    ld.resolve('ack:late'); await flush()
    expect(el.log).toEqual([])
    expect(revoked).toEqual(['ack:late'])
  })

  it('a load that lands after the delay but inside the wait window still plays', async () => {
    const c = clock(); const el = element(); const ld = deferred()
    const { ack } = ackFor(el, c, { loadDeferred: ld })
    await c.advance(ACK_DELAY_MS + 300)
    ld.resolve('ack:1'); await flush()
    expect(el.current).toBe('ack:1')
    expect(ack.state).toBe('playing')
  })

  it('does not play on a superseded turn / muted voice (isLive false at play time)', async () => {
    const c = clock(); const el = element()
    const { ack } = ackFor(el, c, { live: () => false })
    await c.advance(ACK_DELAY_MS)
    expect(el.log).toEqual([])
    expect(ack.outcome).toBe('not-live')
  })

  it('a lost `ended` event cannot hold the reply hostage', async () => {
    const c = clock(); const el = element()
    const { ack } = ackFor(el, c)
    await c.advance(ACK_DELAY_MS)
    await c.advance(ACK_MAX_PLAY_MS)
    expect(ack.outcome).toBe('play-timeout')
  })
})

// ── Sequencing with the reply's speech queue (the invariant) ──────────────────────

describe('clip → first sentence on ONE element', () => {
  it('the first sentence never overlaps or cuts the clip: it waits, then plays the instant the clip ends', async () => {
    const c = clock(); const el = element()
    const { ack } = ackFor(el, c)
    const { s, synthCalls } = speechFor(el, { startAfter: ack.done })
    await c.advance(ACK_DELAY_MS)
    expect(el.current).toBe('ack:1')
    // The reply streams in and its first sentence is synthesised WHILE the clip plays.
    ack.replyStarted()
    s.update(REPLY.slice(0, 70)); await flush()
    s.end(REPLY); await flush()
    expect(synthCalls.length).toBeGreaterThan(0)       // synthesis is not held…
    expect(el.current).toBe('ack:1')                    // …playback is
    expect(el.overlaps).toEqual([])
    el.end(); await flush()                              // clip finishes naturally
    expect(el.current).toBe('tts:1')
    el.end(); await flush()
    el.end(); await flush()
    expect(el.overlaps).toEqual([])
    expect(el.log[0]).toBe('play ack:1')
    expect(el.log[1]).toBe('end ack:1')
    expect(el.log[2]).toBe('play tts:1')
  })

  it('POSITIVE CONTROL: without the gate the same sequence DOES cut the clip (the harness can see it)', async () => {
    const c = clock(); const el = element()
    const { ack } = ackFor(el, c)
    const { s } = speechFor(el, { startAfter: null })
    await c.advance(ACK_DELAY_MS)
    ack.replyStarted()
    s.update(REPLY.slice(0, 70)); await flush()
    expect(el.overlaps).toEqual([{ cut: 'ack:1', by: 'tts:1' }])
  })

  it('a skipped clip (reply first) does not delay the reply at all', async () => {
    const c = clock(); const el = element()
    const { ack } = ackFor(el, c)
    const { s } = speechFor(el, { startAfter: ack.done })
    s.update(REPLY.slice(0, 70))
    ack.replyStarted()
    await flush()
    expect(el.current).toBe('tts:1')
    expect(el.log).toEqual(['play tts:1'])
  })

  it('stop during the clip cancels BOTH: clip paused, queued sentence never plays, its url freed', async () => {
    const c = clock(); const el = element()
    const { ack } = ackFor(el, c)
    const { s, revoked } = speechFor(el, { startAfter: ack.done })
    await c.advance(ACK_DELAY_MS)
    ack.replyStarted()
    s.update(REPLY); await flush()                       // first sentence ready, held behind the clip
    // stopCurrentAudio: the speech queue first, then the clip.
    s.cancel(); ack.cancel(); await flush()
    await c.advance(20_000)
    expect(el.log).toEqual(['play ack:1', 'pause ack:1'])
    expect(el.current).toBe(null)
    expect(revoked).toContain('tts:1')
    let sDone = false; s.done.then(() => { sDone = true }); await flush()
    expect(sDone).toBe(true)
  })

  it('stop in the OTHER order (clip first) still never plays the held sentence', async () => {
    const c = clock(); const el = element()
    const { ack } = ackFor(el, c)
    const { s } = speechFor(el, { startAfter: ack.done })
    await c.advance(ACK_DELAY_MS)
    ack.replyStarted()
    s.update(REPLY); await flush()
    ack.cancel(); s.cancel(); await flush()
    await c.advance(20_000)
    expect(el.log).toEqual(['play ack:1', 'pause ack:1'])
  })

  it('stop while the first sentence is still being synthesised: the late fetch is revoked, nothing plays', async () => {
    const c = clock(); const el = element(); const pending = []
    const { ack } = ackFor(el, c)
    const { s, revoked } = speechFor(el, { startAfter: ack.done, synthDeferreds: pending })
    await c.advance(ACK_DELAY_MS)
    ack.replyStarted()
    s.update(REPLY); await flush()
    s.cancel(); ack.cancel()
    pending[0].d.resolve(pending[0].url); await flush()
    el.end(); await flush()
    expect(el.log).toEqual(['play ack:1', 'pause ack:1'])
    expect(revoked).toContain('tts:1')
  })

  it('mic start cancels only the clip: the reply then plays normally (same as today with an open mic)', async () => {
    const c = clock(); const el = element()
    const { ack } = ackFor(el, c)
    const { s } = speechFor(el, { startAfter: ack.done })
    await c.advance(ACK_DELAY_MS)
    ack.replyStarted()
    s.update(REPLY); await flush()
    ack.cancel(); await flush()
    expect(el.log).toEqual(['play ack:1', 'pause ack:1', 'play tts:1'])
    expect(el.overlaps).toEqual([])
  })
})
