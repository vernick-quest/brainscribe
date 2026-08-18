// lib/composerDraft.js — keep what the student typed into the composer, on their device.
//
// ── The loss this exists for (Sierra, 2026-08-17) ────────────────────────────────────
// "make it so you can get back something you delete… I was writing my whole outline in the
// chat for my coach and tried to cut and paste something. I ended up deleting probably at
// least half an hour of work."
//
// Every guard this codebase has protects text AFTER it reaches the server — the truncation
// guard, the no-overwrite guard, detectLockOverClaim, the session-health pass. Hers died in
// the browser, in the composer, with nothing failing and no request made. There was nothing
// to detect, because nothing went wrong by any measure the server can see.
//
// ── Why this is not a new store ──────────────────────────────────────────────────────
// TutorSession already restores a student's words into the composer: `recoveredDictation`
// → the `recoveredText` prop → the composer's restore effect. Its comment already states
// the invariant — "when /api/scribe fails, the student's spoken paragraph must never be
// lost" — and the code upholds it for exactly two server failures. This module is the
// persistence for that SAME path, not a second one: it writes the draft down, and reading
// it back feeds the one restore effect that already exists. Two stores that both believe
// they hold the draft is the composition failure this repo hit three times in one week.
//
// PURE apart from the storage object, which is INJECTED — so every rule below is unit
// tested against a fake, and nothing here needs a browser.

const PREFIX = 'brainscribe:composer:'
const VERSION = 1
// Which composer the words were typed into. Anything else is normalised to null, which
// the caller reads as the chat box — the safe direction, since chat text landing in the
// chat box is a non-event while essay text landing there is not.
const MODES = ['listening', 'dictating']

// A draft nobody has touched in a month is abandoned, and an unbounded pile of other
// people's sentences should not sit on a shared family device forever. Long enough that a
// session resumed across weeks (they happen — one ran 06-25 to 07-10) still gets its words
// back; short enough that the pile is bounded.
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function draftKey(sessionId) {
  return `${PREFIX}${sessionId}`
}

/**
 * Persist the composer's current text.
 *
 * ⚠️ NEVER writes an empty draft over a stored one. "Clear on SUCCESSFUL SEND only" is the
 * whole point: emptying the box is the exact gesture that lost her work (select-all, cut,
 * paste goes wrong), so treating it as "the student has no draft now" would make this
 * module dutifully record the deletion and hand back nothing. Only clearDraft clears.
 *
 * @returns {boolean} whether the write landed. A `false` here means the student's words are
 *   NOT saved anywhere, so callers must log it — this module's whole job is silent
 *   otherwise, and a silent no-op is the failure mode of every bug in this file's header.
 */
export function writeDraft(storage, sessionId, text, mode, now = Date.now()) {
  if (!storage || !sessionId) return false
  if (typeof text !== 'string' || text.trim() === '') return false
  // Normalise the mode rather than storing whatever arrived. An unrecognised value would
  // match NEITHER composer's gate, so the draft would be saved and then silently never
  // restored — a no-op that looks exactly like success, which is this codebase's signature
  // failure. (It is also what a stale 4-argument caller produces, and one existed.)
  const m = MODES.includes(mode) ? mode : null
  try {
    storage.setItem(draftKey(sessionId), JSON.stringify({ v: VERSION, text, mode: m, at: now }))
    return true
  } catch {
    return false      // quota, private mode, storage disabled — the caller logs
  }
}

/**
 * Read a stored draft back as `{ text, mode }`, or null.
 *
 * `mode` is which box the words were typed into — 'listening' (chat with the coach) or
 * 'dictating' (words headed for the essay). It is carried because restoring across the two
 * is not a neutral mistake: the dictating box's button says "Add to essay", so a restored
 * chat message sitting in it becomes essay content the moment the student presses Enter
 * out of habit. Red-team, 2026-08-17.
 *
 * Returns null for anything it cannot vouch for — missing, unparseable, wrong version,
 * empty, or older than DRAFT_MAX_AGE_MS — and DELETES what it rejects, so a corrupt record
 * cannot sit there being re-parsed forever. It never throws: a bad record must not be able
 * to stop a session from opening.
 */
export function readDraft(storage, sessionId, now = Date.now()) {
  if (!storage || !sessionId) return null
  let raw
  try { raw = storage.getItem(draftKey(sessionId)) } catch { return null }
  if (!raw) return null
  let rec
  try { rec = JSON.parse(raw) } catch { clearDraft(storage, sessionId); return null }
  if (rec?.v !== VERSION || typeof rec.text !== 'string' || rec.text.trim() === '') {
    clearDraft(storage, sessionId)
    return null
  }
  if (!Number.isFinite(rec.at) || now - rec.at > DRAFT_MAX_AGE_MS) {
    clearDraft(storage, sessionId)
    return null
  }
  return { text: rec.text, mode: rec.mode ?? null }
}

/** Remove a draft outright. Prefer clearDraftIfMatches — see why there. */
export function clearDraft(storage, sessionId) {
  if (!storage || !sessionId) return
  try { storage.removeItem(draftKey(sessionId)) } catch { /* nothing to do and nothing lost */ }
}

/**
 * Clear a draft ONLY when it is the text that was just sent.
 *
 * ── The hole an unconditional clear left (red-team, 2026-08-17) ──────────────────────
 * `writeDraft` goes to real lengths to refuse an empty write, because emptying the box is
 * the gesture that lost her work. An unconditional clear undid that from the other side,
 * and MicButton makes it routine: tapping the mic fires `onInterim('')`, which empties the
 * composer (MicButton.js:74). So —
 *
 *   1. student types their whole outline into the chat box  → saved
 *   2. student taps the mic to ask a quick question         → box empties, save REFUSED ✓
 *   3. student speaks "what should I do next?" and sends    → send succeeds
 *   4. the outline is deleted, because the send succeeded
 *
 * That is Sierra's own scenario — an outline typed into the chat — destroyed by the fix
 * meant to save it. A stale in-flight resolve does the same to a NEWER draft: send "ok",
 * start typing the next passage, and `/api/messages` resolving 200 half a second later
 * removes the passage.
 *
 * So the rule is the narrow one: delete words only when they are the words you sent.
 * Anything else is someone's unsent draft, and it stays.
 *
 * @returns {'cleared'|'kept'|'absent'} — `kept` means a DIFFERENT draft is still stored,
 *   which the caller must not treat as "there is no draft now".
 */
export function clearDraftIfMatches(storage, sessionId, sentText, now = Date.now()) {
  const stored = readDraft(storage, sessionId, now)
  if (!stored) return 'absent'
  if (typeof sentText !== 'string' || stored.text.trim() !== sentText.trim()) return 'kept'
  clearDraft(storage, sessionId)
  return 'cleared'
}

/**
 * Delete every expired draft, not just this session's.
 *
 * `readDraft` only ever expires the key it is asked for, and it is only ever asked for the
 * session being opened — so DRAFT_MAX_AGE_MS pruned nothing for an abandoned session and
 * the store grew one key per session forever. This file's own comment claimed the pile was
 * bounded; it was not, until this. Runs once per mount and never throws.
 *
 * @returns {number} how many were removed.
 */
export function sweepExpiredDrafts(storage, now = Date.now()) {
  if (!storage) return 0
  let keys
  try { keys = Object.keys(storage).filter(k => k.startsWith(PREFIX)) } catch { return 0 }
  let removed = 0
  for (const k of keys) {
    let rec
    try { rec = JSON.parse(storage.getItem(k)) } catch { rec = null }
    const at = rec?.at
    if (!Number.isFinite(at) || now - at > DRAFT_MAX_AGE_MS) {
      try { storage.removeItem(k); removed++ } catch { /* leave it; nothing is lost */ }
    }
  }
  return removed
}

/**
 * The browser's localStorage, or null where it is unavailable or blocked.
 *
 * Kept here so callers never touch `window` directly: this runs under SSR, and Safari in
 * private mode throws on ACCESS to localStorage, not just on write.
 */
export function getDraftStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}
