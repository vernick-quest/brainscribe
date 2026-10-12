// lib/coachTurn.js — the lifecycle of ONE coach turn (/api/tutor): its timeout watchdog,
// whether its tokens may still be applied, and what its exit does to the UI.
//
// ── Why this exists (2026-10-12) ─────────────────────────────────────────────────────
// Two ways a turn could leave the session stuck on "Owen is thinking…" with Send (and
// every panel action, which is gated on the same phase) disabled until a reload:
//
//   1. The exit paths reset the UI only if `tutorRunRef` still held the turn's id. But
//      that counter is ALSO bumped by things that are not new turns — Replay, the student
//      starting to speak, unmount — because it doubles as the "stop this turn's audio"
//      signal. Tap Replay while the coach is thinking, have the request fail, and no exit
//      path believed it owned the UI. Fix: the UI belongs to the newest TURN (a counter
//      bumped only when a turn starts), not to the newest audio owner.
//   2. There was no timeout. A request that never answered, or a stream that stopped
//      mid-reply, waited forever. Fix: a watchdog that aborts the request.
//
// ── The numbers ──────────────────────────────────────────────────────────────────────
// The coach model is moving to one with ~4.7s median / ~7.6s p90 to its first word.
// FIRST_TEXT_TIMEOUT_MS is armed BEFORE the fetch (it covers the server's own DB reads
// and the headers too) and is ~6× that p90; a slow-but-healthy reply is never cut. Once
// bytes flow, STALL_TIMEOUT_MS is the longest silence allowed BETWEEN chunks — a healthy
// stream sends a chunk every few tens of ms, so 45s of nothing means it is dead. There is
// deliberately NO cap on total length: a long healthy reply keeps resetting the stall timer.
//
// ── What an aborted turn may NOT do ──────────────────────────────────────────────────
// A timed-out turn never applies its tokens. Aborting errors the response body, so the
// read loop throws before the scaffold parse — and `finish()` is checked after the loop
// too, so a stream that closed in the same instant the watchdog fired can't slip through.
// A late [DONE:] from it can't write.
//   This is NOT extended to turns that were merely superseded (Replay tapped, the student
//   started speaking, a newer turn started): those still apply their tokens, exactly as
//   before. Dropping a superseded turn's [DONE:] would lose a lock the coach really made —
//   and the server has already recorded that promise in coach_commitments.
//
// Pure apart from injected timers, so the rules are unit-tested (lib/coachTurn.test.js).

export const FIRST_TEXT_TIMEOUT_MS = 45_000
export const STALL_TIMEOUT_MS = 45_000

/**
 * One turn's watchdog + abort state.
 *   onTimeout(kind)   called once when a timer fires ('first-text' | 'stall'), after the
 *                     turn is marked aborted — the caller aborts the fetch there.
 *   schedule/clear    injectable timers.
 * start()        arm the first-text timer (call before the fetch).
 * chunk()        bytes arrived: switch to / reset the stall timer.
 * finish()       the stream closed: disarm. Returns true when the turn may still apply its
 *                result (i.e. it was not aborted). Call it BEFORE touching the scaffold.
 * abort(reason)  mark aborted and disarm (e.g. a manual cancel). Idempotent.
 */
export function createTurnWatchdog({
  onTimeout = () => {},
  firstTextMs = FIRST_TEXT_TIMEOUT_MS,
  stallMs = STALL_TIMEOUT_MS,
  schedule = (fn, ms) => setTimeout(fn, ms),
  clear = (id) => clearTimeout(id),
} = {}) {
  let timer = null
  let sawBytes = false
  let finished = false
  let aborted = false
  let reason = null

  function disarm() { if (timer != null) { clear(timer); timer = null } }
  function arm(kind, ms) {
    disarm()
    timer = schedule(() => {
      timer = null
      if (finished || aborted) return
      aborted = true
      reason = kind === 'first-text' ? 'timeout-first-text' : 'timeout-stall'
      try { onTimeout(kind) } catch {}
    }, ms)
  }

  return {
    start() { if (!finished && !aborted) arm('first-text', firstTextMs) },
    chunk() {
      if (finished || aborted) return
      sawBytes = true
      arm('stall', stallMs)
    },
    finish() { finished = true; disarm(); return !aborted },
    abort(why = 'aborted') { if (aborted) return; aborted = true; reason = why; disarm() },
    get aborted() { return aborted },
    get timedOut() { return aborted && typeof reason === 'string' && reason.startsWith('timeout') },
    get reason() { return reason },
    get sawBytes() { return sawBytes },
  }
}

/**
 * How a turn ended → what kind of failure it was (null = it did not fail).
 *   outcome: 'ok' | 'http' | 'error'      status: HTTP status for 'http'
 *   timedOut: the watchdog fired (an AbortError thrown because of it is a TIMEOUT, not
 *   a generic error).
 */
export function classifyTurnFailure({ outcome, status = null, timedOut = false }) {
  if (timedOut) return 'timeout'
  if (outcome === 'ok') return null
  if (outcome === 'http' && status === 429) return 'rate-limited'
  return 'error'
}

/**
 * What a turn's exit may do to the shared UI. The phase, the caption/indicator and the
 * retry offer belong to the NEWEST turn: an older turn finishing (or failing) late must
 * not reopen Send under a newer turn that is still thinking, nor clear its indicator.
 *   myTurn / currentTurn: turn ids from a counter bumped ONLY when a turn starts (never by
 *   Replay / speech / audio stops — that is the bug this replaces).
 *   mounted: false after unmount → touch nothing.
 * Returns { ownsUi, offerRetry }.
 */
export function turnExit({ myTurn, currentTurn, mounted = true, failure = null }) {
  const ownsUi = mounted && myTurn === currentTurn
  return { ownsUi, offerRetry: ownsUi && failure != null }
}

/** The inline message for a failed turn. Gentle; never blames the student. */
export function turnFailureMessage(failure, coachName = 'Your coach') {
  if (failure === 'timeout') return 'That took too long — tap to try again.'
  if (failure === 'rate-limited') return 'Lots of messages in a row — give it a few seconds, then tap to try again.'
  return `${coachName} couldn't answer just then — tap to try again.`
}

/**
 * A one-shot retry slot, so a double tap can't send the same turn twice. offer() stores the
 * turn's request; take() hands it back exactly once and empties the slot; clear() drops it
 * (a new turn started — the old failure is moot).
 */
export function createRetrySlot() {
  let pending = null
  return {
    offer(req) { pending = req },
    take() { const r = pending; pending = null; return r },
    clear() { pending = null },
    get pending() { return pending },
  }
}

/**
 * Drive ONE coach turn end to end, with every exit path accounted for. TutorSession's
 * askTutor is a thin adapter over this; everything that decides "who owns the UI",
 * "may this turn's tokens apply" and "did it time out" lives here, under test.
 *
 *   myTurn                 this turn's id (from the turn counter)
 *   currentTurn()          the newest turn id NOW
 *   isMounted()            false once the session screen unmounted
 *   request(signal)        → Promise<Response>  (fetch to /api/tutor with the signal)
 *   onHeaders()            the response is OK and about to stream
 *   onChunk(full, owns)    raw text so far; `owns` = this turn still owns the shared UI
 *   onStreamEnd(full)      the stream closed cleanly and the turn was NOT aborted
 *   apply(full, ownsUi)    tokens + commit. Only ever called for a non-aborted turn.
 *                          `ownsUi()` is re-evaluated by the caller at the moment it
 *                          touches the phase/caption (apply awaits network writes).
 *   onFailure({ failure, ownsUi, offerRetry, sawBytes, partial })   the turn failed.
 *                          Called once. `partial` = the raw text received before it died —
 *                          NEVER to be applied as writes; it exists so a display-only SAFETY
 *                          signal ([CARE]) that already arrived is not dropped by the abort.
 *   makeAbortController / watchdog: injectable for tests.
 * Returns { outcome: 'ok' | 'failed', failure, applied }.
 */
export async function runCoachTurn({
  myTurn, currentTurn, isMounted = () => true,
  request, onHeaders = () => {}, onChunk = () => {}, onStreamEnd = () => {},
  apply = async () => {}, onFailure = () => {},
  makeAbortController = () => new AbortController(),
  watchdog = {}, log = { error: (...a) => console.error(...a), warn: (...a) => console.warn(...a) },
}) {
  const ctrl = makeAbortController()
  const wd = createTurnWatchdog({
    ...watchdog,
    onTimeout: (kind) => {
      log.warn(`[tutor] turn ${myTurn} timed out (${kind === 'first-text' ? 'no reply' : 'stream stalled'}) — aborting; nothing from it will be applied`)
      try { ctrl.abort() } catch {}
    },
  })
  const owns = () => turnExit({ myTurn, currentTurn: currentTurn(), mounted: isMounted() }).ownsUi
  let reader = null
  let applied = false
  let full = ''

  function fail(outcome, status, err) {
    wd.finish()
    try { reader?.cancel?.().catch?.(() => {}) } catch {}
    const failure = classifyTurnFailure({ outcome, status, timedOut: wd.timedOut })
    const exit = turnExit({ myTurn, currentTurn: currentTurn(), mounted: isMounted(), failure })
    if (failure !== 'timeout') log.error(`[tutor] turn ${myTurn} failed (${failure}${status ? ` ${status}` : ''}):`, err?.message ?? err ?? '')
    if (!exit.ownsUi) log.warn(`[tutor] turn ${myTurn} failed after a newer turn started (or the screen closed) — leaving the UI to that turn`)
    try { onFailure({ failure, ownsUi: exit.ownsUi, offerRetry: exit.offerRetry, sawBytes: wd.sawBytes, partial: full }) } catch (e) { log.error('[tutor] onFailure threw:', e) }
    return { outcome: 'failed', failure, applied }
  }

  wd.start()
  try {
    const res = await request(ctrl.signal)
    if (!res.ok) {
      let body = ''
      try { body = await res.text() } catch {}
      return fail('http', res.status, body)
    }
    onHeaders()
    reader = res.body.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      wd.chunk()
      full += decoder.decode(value, { stream: true })
      onChunk(full, owns())
    }
    full += decoder.decode()
    // The watchdog may have fired in the same instant the stream closed. An aborted turn
    // applies NOTHING — this is the check that stops a late [DONE:] from writing.
    if (!wd.finish()) return fail('error', null, new Error('aborted'))
    onStreamEnd(full)
    applied = true
    await apply(full, owns)
    return { outcome: 'ok', failure: null, applied }
  } catch (err) {
    return fail('error', null, err)
  }
}
