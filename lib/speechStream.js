// lib/speechStream.js — speak the coach's reply sentence by sentence while it is still
// streaming, so the voice starts with the text instead of after it.
//
// ── Why this exists (2026-10-11) ─────────────────────────────────────────────────────
// Product report: "it types everything out then starts speaking." TutorSession already
// tried to speak the first sentence early, but its split had two holes that sent most
// turns down the slow path (wait for the WHOLE stream, then synthesise the WHOLE reply):
//
//   1. The first sentence had to be ≥ 8 chars. The prompt itself teaches openers like
//      "Okay." and "Right." — and the regex was anchored at the start, so a short opener
//      never split and the turn fell through to whole-reply TTS after the stream ended.
//   2. It needed visible text AFTER the sentence. A lock turn ends its prose and then
//      streams a long [DONE:id:…] payload (the student's own paragraph). That payload is
//      hidden, so the prose looked "unfinished" until the stream closed — the student
//      read the entire reply while the payload streamed, and only then heard a word.
//
// ── The safety contract ────────────────────────────────────────────────────────────
// The coach stream carries an inline control protocol. A [DONE:id:…] payload is the
// STUDENT'S OWN WORDS. Speaking it would read their paragraph back at them; speaking a
// half-arrived token would read "DONE colon hook" aloud. So speech is cut from a
// stricter view of the text than the screen:
//   • ANY bracketed span is removed, depth-aware (a payload containing "[" can't leak).
//   • Everything from the FIRST unclosed "[" onward is held back — while streaming that
//     is a token still arriving; at the end it is a token truncated at max_tokens, whose
//     payload is student text. It is never spoken in either case.
//   • A chunk that still contains a stray "]" is dropped, not spoken: it means a payload
//     closed early and the text after it may be the student's words.
// Chunks are only ever cut at sentence boundaries of that cleaned text, and the cleaned
// text is prefix-stable as the stream grows, so a chunk once spoken is never re-spoken.
//
// ── The cost contract ──────────────────────────────────────────────────────────────
// ElevenLabs bills per character. Chunks PARTITION the cleaned text, so the characters
// sent per reply never exceed the prose (they are usually fewer: whitespace and markdown
// asterisks are dropped). Request COUNT is bounded by `maxRequests` (default 4) — the
// /api/speak limiter is 60/min and 800/day per account, and the old path used ≤ 2.
//
// Pure apart from the injected I/O (synth / play / revoke / fallback), so the queue's
// ordering, cancellation and cost behaviour are unit-tested without a DOM.

export const MIN_FIRST_CHUNK_CHARS = 24
export const MAX_REQUESTS_PER_REPLY = 4

/**
 * The text that may be spoken, from a raw (possibly still-streaming) coach buffer.
 * Removes every bracketed span (depth-aware) and holds back everything after the first
 * unclosed "[". `held` is true when something is being held back — i.e. the visible
 * text is followed by more (hidden) content, so a sentence ending there is complete.
 */
export function speakableProse(raw) {
  const s = typeof raw === 'string' ? raw : ''
  let out = ''
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '[') { depth++; continue }
    if (ch === ']' && depth > 0) { depth--; continue }
    if (depth === 0) out += ch
  }
  return { text: out, held: depth > 0 }
}

// Words that end in "." without ending a sentence. A split there would only cost a
// slight prosody break, never a wrong word, so the list stays short.
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'vs', 'etc', 'prof', 'mt', 'approx', 'e.g', 'i.e', 'eg', 'ie'])

const END_RE = /[.!?…]+["'”’)*_]*(?=\s|$)/g

/**
 * Offsets (exclusive ends) of complete sentences in `text`. A terminator at the very end
 * of the text only counts when `endIsBoundary` (more content is known to follow, or the
 * stream is over) — otherwise "3." might still become "3.5".
 */
export function sentenceEnds(text, { endIsBoundary = false } = {}) {
  const ends = new Set()
  END_RE.lastIndex = 0
  let m
  while ((m = END_RE.exec(text)) !== null) {
    const end = m.index + m[0].length
    if (end === text.length && !endIsBoundary) continue
    if (m[0] === '.') {
      const before = text.slice(0, m.index)
      const word = (before.match(/([A-Za-z][A-Za-z.]*)$/) || [])[1]
      if (word && (word.length === 1 || ABBREVIATIONS.has(word.toLowerCase()))) continue
      if (/(^|\n)\s*\d{1,2}$/.test(before)) continue   // "1." list marker
    }
    ends.add(end)
  }
  // A line break ends a chunk too (lists, a question on its own line).
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
    if (i > 0 && text.slice(0, i).trim()) ends.add(i)
  }
  return [...ends].sort((a, b) => a - b)
}

/** What actually goes to TTS for a slice of prose: no markdown asterisks, one-line. */
export function speechText(s) {
  return String(s ?? '').replace(/\*+/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * The next chunk to speak, starting at `from` in the cleaned text.
 *   final → everything left (the stream is over).
 *   first → the SHORTEST run of complete sentences reaching `minChars` — fast to
 *           synthesise, and long enough to cover the next chunk's fetch.
 *   else  → every complete sentence available (fewest requests).
 * Returns { chunk, end } (chunk may be '' for whitespace — advance without speaking)
 * or null when nothing is ready yet.
 */
export function nextSpeechChunk(text, from, { held = false, final = false, first = false, minChars = MIN_FIRST_CHUNK_CHARS } = {}) {
  if (from >= text.length) return null
  const mk = end => ({ end, chunk: speechText(text.slice(from, end)) })
  if (final) return mk(text.length)
  const ends = sentenceEnds(text, { endIsBoundary: held }).filter(e => e > from)
  if (!ends.length) return null
  if (first) {
    const e = ends.find(e => text.slice(from, e).trim().length >= minChars)
    return e === undefined ? null : mk(e)
  }
  return mk(ends[ends.length - 1])
}

const FAILED = Symbol('tts-failed')

/**
 * A cancellable, ordered speech queue fed by a growing raw buffer.
 *
 *   synth(text)  → Promise<url>     fetch TTS for one chunk (rejects on failure)
 *   play(url)    → Promise<void>    play on the ONE unlocked element; resolve at the end
 *   revoke(url)                     free a url that was fetched (played or not)
 *   fallback(text) → Promise<void>  optional: speak a chunk whose synth failed
 *   isLive()     → boolean          checked before every dispatch and every play
 *   onFirstDispatch()               optional: the first TTS request just went out
 *   startAfter     Promise           optional: nothing plays until it settles — the
 *                                    acknowledgement clip (lib/ackClips) still on the
 *                                    element. Synthesis is NOT held, only playback, so
 *                                    the first sentence starts the instant the clip ends.
 *                                    Re-checked after: a stop during the wait plays nothing.
 *
 * update(raw) on every stream read; end(raw) when the stream closes; cancel() to stop.
 * `done` resolves when everything has played OR on cancel — it never hangs on a clip
 * that a stop left paused. After cancel nothing is fetched or played again, and a fetch
 * that resolves late is revoked, never played.
 */
export function createSpeechStream({
  synth, play, revoke = () => {}, fallback = null, isLive = () => true,
  onFirstDispatch = null, startAfter = null, minFirstChars = MIN_FIRST_CHUNK_CHARS,
  maxRequests = MAX_REQUESTS_PER_REPLY, warn = (...a) => console.warn(...a),
}) {
  let raw = ''
  let ended = false
  let cancelled = false
  let consumed = 0        // offset into speakableProse(raw).text already queued
  let dispatched = 0      // chunks queued
  let started = 0         // chunks handed to play/fallback
  let synthFailed = false // sticky: one failed TTS → the rest of this reply uses fallback
  let playerRunning = false
  let finished = false
  const items = []
  const stats = { requests: 0, chars: 0, chunks: [], dropped: 0 }

  let resolveDone
  const done = new Promise(r => { resolveDone = r })
  function finish() { if (!finished) { finished = true; resolveDone() } }

  function enqueue(text) {
    const item = { text }
    if (synthFailed) {
      item.url = Promise.resolve(FAILED)
    } else {
      stats.requests++
      stats.chars += text.length
      let req
      try { req = Promise.resolve(synth(text)) } catch (err) { req = Promise.reject(err) }
      item.url = req.then(u => u || FAILED, () => { synthFailed = true; return FAILED })
    }
    stats.chunks.push(text)
    items.push(item)
    dispatched++
    if (dispatched === 1) onFirstDispatch?.()
  }

  function pump() {
    if (cancelled) return
    if (!isLive()) { cancel(); return }
    // Cheap early-out: while streaming with a chunk already waiting (or the cap reached),
    // nothing can be dispatched — don't rescan the buffer on every stream read.
    const canDispatch = ended || dispatched === 0 || (dispatched < maxRequests - 1 && items.length - started === 0)
    if (!canDispatch) { runPlayer(); return }
    const { text, held } = speakableProse(raw)
    for (;;) {
      let r = null
      // First chunk: the shortest run of sentences that is long enough — also when the
      // whole text is already known (end() before any dispatch: a greeting, a replay,
      // a reply that streamed faster than one sentence), so the voice still starts on
      // a short clip instead of waiting for the whole reply to synthesise.
      if (dispatched === 0) r = nextSpeechChunk(text, consumed, { held: held || ended, first: true, minChars: minFirstChars })
      if (!r) {
        if (ended) r = nextSpeechChunk(text, consumed, { final: true })
        // While streaming: only when nothing is waiting to play (one request ahead), and
        // always keep the last request for the remainder.
        else if (dispatched > 0 && dispatched < maxRequests - 1 && items.length - started === 0) r = nextSpeechChunk(text, consumed, { held })
      }
      if (!r) break
      consumed = r.end
      if (!r.chunk) continue
      if (r.chunk.includes(']')) {
        // Never log the chunk itself — it may be the student's words.
        stats.dropped++
        warn('[speech] dropped a chunk with a stray "]" — possible leaked control-token payload; not spoken')
        continue
      }
      enqueue(r.chunk)
      if (!ended) break   // one request ahead while streaming
    }
    runPlayer()
    if (ended && !playerRunning && started === items.length) finish()
  }

  async function runPlayer() {
    if (playerRunning || cancelled) return
    playerRunning = true
    try {
      while (!cancelled && started < items.length) {
        const item = items[started]
        const url = await item.url
        if (cancelled) return                       // cancel() already revokes unplayed urls
        // Never overlap or cut the acknowledgement clip: hold the FIRST play until it is
        // over. `started` is not yet advanced, so a cancel() during this wait revokes this
        // item's url along with the rest — and the re-check below plays nothing.
        if (started === 0 && startAfter) {
          try { await startAfter } catch {}
          if (cancelled) return
        }
        if (!isLive()) { cancel(); return }
        started++
        pump()                                       // pull the next chunk while this one plays
        if (url === FAILED) {
          if (fallback) await fallback(item.text)
        } else {
          try { await play(url) } finally { revoke(url) }
        }
      }
    } finally {
      playerRunning = false
    }
    if (!cancelled && ended && started === items.length) finish()
  }

  function cancel() {
    if (cancelled) return
    cancelled = true
    for (let i = started; i < items.length; i++) {
      items[i].url.then(u => { if (u && u !== FAILED) revoke(u) })
    }
    finish()
  }

  return {
    update(next) { if (ended || cancelled) return; raw = String(next ?? ''); pump() },
    end(next) { if (ended || cancelled) return; if (next != null) raw = String(next); ended = true; pump() },
    cancel,
    done,
    stats,
    get cancelled() { return cancelled },
  }
}
