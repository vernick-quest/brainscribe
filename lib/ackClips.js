// lib/ackClips.js — the instant spoken acknowledgement ("Mm, okay…") that covers the gap
// between a student's turn and the coach's first word.
//
// ── Why this exists (2026-10-12) ─────────────────────────────────────────────────────
// The coach model is moving to one that takes ~4.7s median (p90 ~7.6s) to its first word,
// against ~1.1s today. Five seconds of silence after you speak reads as "it didn't hear
// me". A human tutor fills that gap with a small noise of attention, so the coach does
// too: a short, PRE-RENDERED clip in the persona's own voice (static mp3, no TTS round
// trip), then the real reply as soon as its first sentence is ready.
//
// ── The contract ─────────────────────────────────────────────────────────────────────
//   • NEUTRAL lines only. The clip plays before the coach has read the turn, so it can
//     never judge the work ("great job!") and never ask a question the reply might
//     contradict. Every line has to fit "idk", a pasted paragraph, and "wait, what?".
//   • NEVER OVERLAP, NEVER CUT. The clip is not truncated when the reply is ready; the
//     reply's speech queue waits for `controller.done` (createSpeechStream `startAfter`)
//     and starts the moment the clip ends. Both go through the ONE unlocked element.
//   • STOP CANCELS BOTH. cancel() pauses the clip if it is playing and resolves `done`
//     immediately, so a stop can never leave the reply queue waiting on an `ended` event
//     that a paused clip will never fire. (TutorSession's stopCurrentAudio cancels the
//     speech queue in the same call.)
//   • SILENT ON FAILURE. A missing/failed clip, a slow load, or a lost `ended` event all
//     resolve `done` — the reply is never blocked by the acknowledgement.
//
// Pure apart from the injected I/O, so the decision rules and the sequencing are
// unit-tested without a DOM (lib/ackClips.test.js).

/** Wait this long after the send before speaking. If the reply's first words arrive
 *  inside this window the clip is pointless (and would delay the real voice), so it is
 *  skipped. Doubles as the clip's load window — the fetch starts at the send. */
export const ACK_DELAY_MS = 600

/** If the clip still hasn't loaded this long after the send, skip it: a late "Mm, okay"
 *  lands on top of a reply that is about to start. */
export const ACK_MAX_WAIT_MS = 1800

/** Backstop for a lost `ended` event. Every clip is < 2s at 1×; at the slowest pace
 *  (0.5×) that is < 4s. Past this the reply is released regardless. */
export const ACK_MAX_PLAY_MS = 8000

/** Rate limit. An acknowledgement on every single turn sounds robotic — a rapid
 *  back-and-forth would hear "Mm, okay" every few seconds. So at most one per this many
 *  ms, measured from the last clip that actually PLAYED. Quick exchanges get the visual
 *  "is thinking" indicator only; a turn after a pause gets the voice too. Tunable. */
export const MIN_ACK_GAP_MS = 20000

// The lines, per PERSONA key (lib/personas.js / lib/prompts.js). Matched to each coach's
// method: Owen patient, Deon direct, Zoe curious, Alistair calm/plain, Tilly attentive,
// Jade casual. Rendered by scripts/pregen-coach-acks.mjs → public/coaches/audio/ack/.
// ⚠️ Changing a line means re-running that script — the mp3 is the line.
// Deliberately few "Okay."/"Right." OPENERS: the prompt teaches those as reply openers,
// and "Right, okay. Right. So…" is the robotic stutter this is meant to avoid.
export const ACK_LINES = {
  owen: [
    'Mm, okay.',
    'Hmm, let me think about that.',
    'Okay… give me a second.',
    'Alright, let me think.',
    'Let me sit with that for a second.',
    'Mm-hmm, I hear you.',
    'Hmm, okay. Thinking.',
    'Got it. One moment.',
  ],
  deon: [
    'Got it.',
    'Alright, hang on.',
    'Copy that.',
    'One sec.',
    'Okay, let me think.',
    'Heard. Give me a second.',
    'Alright. Thinking.',
    'Mm, okay. Hold on.',
  ],
  zoe: [
    'Ooh, okay.',
    'Ooh, hold on, let me think.',
    'Mm, hang on…',
    'Okay, okay — thinking.',
    'Ooh. Give me a sec.',
    'Hmm, let me think about that.',
    'Oh, okay!',
    'Mm-hmm, one second.',
  ],
  alistair: [
    'Mm. Let me think about that.',
    'I see.',
    'Alright — one moment.',
    'Understood.',
    'Let me consider that.',
    'Hm. Give me a moment.',
    'Right — let me think.',
    'Mm-hmm. Thinking.',
  ],
  matilda: [
    'Mm, okay.',
    'I hear you.',
    'Oh, okay — let me think.',
    'Let me think about that.',
    'Okay, one second.',
    'Mm-hmm, give me a moment.',
    'Got it. Thinking.',
    'Hmm, let me sit with that.',
  ],
  jade: [
    'Mm, okay.',
    'Ooh okay, hang on.',
    'Hmm, gimme a sec.',
    'Okay okay.',
    'Alright, lemme think.',
    'Got it, one sec.',
    'Hmm. Thinking.',
    'Oh, okay — hold on.',
  ],
}

// Persona key → asset key (file name). Equal for every coach except Tilly: persona key
// `matilda`, asset `tilly` — the same mapping lib/personas.js documents. The test pins it.
const ASSET_KEY = { owen: 'owen', deon: 'deon', zoe: 'zoe', alistair: 'alistair', matilda: 'tilly', jade: 'jade' }

/** The persona key we have clips for; unknown/legacy keys fall back to Owen (as getPersona does). */
export function ackPersona(persona) {
  return Object.prototype.hasOwnProperty.call(ACK_LINES, persona) ? persona : 'owen'
}

/** Public path of clip `index` (0-based) for a persona. */
export function ackClipPath(persona, index) {
  const p = ackPersona(persona)
  return `/coaches/audio/ack/${ASSET_KEY[p]}-${index + 1}.mp3`
}

/** Every (persona, index, path, text) — what the pre-render script renders. */
export function allAckClips() {
  return Object.entries(ACK_LINES).flatMap(([persona, lines]) =>
    lines.map((text, index) => ({ persona, index, text, path: ackClipPath(persona, index) })))
}

/**
 * Should this turn get an acknowledgement at all? Decided at SEND time.
 *   turnKind  'student' = the student sent text or committed voice to the coach. Anything
 *             else ('ui-action' — Lock it in, Assemble, a panel confirm, the injected
 *             "Yes, add it to my essay" note; 'greeting'; 'replay'; 'onboarding') skips:
 *             those aren't the student talking, and the reply isn't a response to them.
 *   voiceOn   the coach voice toggle (read-aloud). Muted ⇒ no audio of any kind.
 *   replyStarted  the reply is already streaming text ⇒ nothing to cover.
 *   now / lastAckAt  rate limit (MIN_ACK_GAP_MS since the last clip that played).
 * Returns { play, reason } — reason is for logs/tests, never shown.
 */
export function shouldPlayAck({ turnKind, voiceOn, replyStarted = false, now = 0, lastAckAt = null, minGapMs = MIN_ACK_GAP_MS } = {}) {
  if (!voiceOn) return { play: false, reason: 'voice-off' }
  if (turnKind !== 'student') return { play: false, reason: 'not-a-student-turn' }
  if (replyStarted) return { play: false, reason: 'reply-streaming' }
  if (lastAckAt != null && now - lastAckAt < minGapMs) return { play: false, reason: 'rate-limited' }
  return { play: true, reason: 'ok' }
}

/**
 * Random clip choice without an immediate repeat, per persona. `random()` → [0,1).
 * With n lines, the same clip never plays twice in a row for that coach.
 */
export function createAckPicker(random = Math.random) {
  const last = new Map()
  return {
    pick(persona) {
      const p = ackPersona(persona)
      const n = ACK_LINES[p].length
      const prev = last.get(p)
      let i
      if (n <= 1) i = 0
      else if (prev == null) i = Math.min(n - 1, Math.floor(random() * n))
      else {
        // Choose among the n-1 OTHER clips uniformly: no rejection loop, so a stuck RNG
        // can't spin, and the result is never `prev`.
        i = Math.min(n - 2, Math.floor(random() * (n - 1)))
        if (i >= prev) i++
      }
      last.set(p, i)
      return i
    },
  }
}

/**
 * One turn's acknowledgement: wait out the delay (loading the clip meanwhile), then play
 * it unless the reply already started, the turn was superseded, or the load was slow.
 *
 *   load()          → Promise<url>   fetch the clip (rejects on failure)
 *   play(url)       → Promise<void>  play on the ONE unlocked element; resolves at the end
 *   stopPlayback()                   pause the element (called only if the clip is playing)
 *   revoke(url)                      free a loaded url, played or not
 *   isLive()        → boolean        checked right before playing
 *   onPlay()                         the clip is starting (rate-limit bookkeeping)
 *   schedule(fn, ms) / clear(id)     injectable timers; now() injectable clock
 *
 * replyStarted(): the reply's first visible text arrived. Before the clip starts → skip.
 *   While it plays → nothing (it finishes; the reply's voice waits on `done`).
 * cancel(): a stop. Pauses the clip if playing; resolves `done` now.
 * done: resolves exactly once — clip ended, skipped, failed, timed out, or cancelled.
 * outcome: 'played' | 'reply-first' | 'not-live' | 'load-failed' | 'slow-load' |
 *          'play-timeout' | 'cancelled' (null while pending).
 */
export function createAckController({
  load, play, stopPlayback = () => {}, revoke = () => {}, isLive = () => true, onPlay = null,
  delayMs = ACK_DELAY_MS, maxWaitMs = ACK_MAX_WAIT_MS, maxPlayMs = ACK_MAX_PLAY_MS,
  schedule = (fn, ms) => setTimeout(fn, ms), clear = (id) => clearTimeout(id), now = () => Date.now(),
}) {
  const startedAt = now()
  let state = 'waiting'          // waiting → loading → playing → finished
  let outcome = null
  let url = null
  let loadFailed = false
  let delayTimer = null
  let waitTimer = null
  let playTimer = null

  let resolveDone
  const done = new Promise(r => { resolveDone = r })

  function settle(why) {
    if (state === 'finished') return
    state = 'finished'
    outcome = why
    if (delayTimer != null) { clear(delayTimer); delayTimer = null }
    if (waitTimer != null) { clear(waitTimer); waitTimer = null }
    if (playTimer != null) { clear(playTimer); playTimer = null }
    if (url) { const u = url; url = null; try { revoke(u) } catch {} }
    resolveDone()
  }

  function tryPlay() {
    if (state !== 'loading') return
    if (loadFailed) return settle('load-failed')
    if (!url) return                                   // still loading — the load resolves into here
    if (!isLive()) return settle('not-live')
    if (waitTimer != null) { clear(waitTimer); waitTimer = null }
    state = 'playing'
    try { onPlay?.() } catch {}
    playTimer = schedule(() => { playTimer = null; settle('play-timeout') }, maxPlayMs)
    let p
    try { p = Promise.resolve(play(url)) } catch { p = Promise.resolve() }
    p.then(() => settle('played'), () => settle('played'))
  }

  // The fetch starts NOW, in parallel with the delay — the delay is the load window.
  let req
  try { req = Promise.resolve(load()) } catch (err) { req = Promise.reject(err) }
  req.then(
    (u) => {
      if (state === 'finished') { if (u) { try { revoke(u) } catch {} } return }   // late load after skip/cancel
      if (!u) { loadFailed = true } else { url = u }
      tryPlay()
    },
    () => { loadFailed = true; tryPlay() },
  )

  delayTimer = schedule(() => {
    delayTimer = null
    if (state !== 'waiting') return
    state = 'loading'
    const remaining = maxWaitMs - (now() - startedAt)
    if (remaining <= 0 && !url) return settle('slow-load')
    if (!url && !loadFailed) waitTimer = schedule(() => { waitTimer = null; if (state === 'loading') settle('slow-load') }, Math.max(0, remaining))
    tryPlay()
  }, delayMs)

  return {
    done,
    replyStarted() {
      if (state === 'waiting' || state === 'loading') settle('reply-first')
    },
    cancel() {
      if (state === 'finished') return
      if (state === 'playing') { try { stopPlayback() } catch {} }
      settle('cancelled')
    },
    get state() { return state },
    get outcome() { return outcome },
    get pending() { return state !== 'finished' },
  }
}
