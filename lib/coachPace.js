// lib/coachPace.js — how fast the coach talks. See SPEC-coach-pace.md.
//
// ── Why this is accessibility, not a preference ──────────────────────────────────────
// Sierra: "it's nice to have the coaches actually talk… but only if they can match the pace
// you need." She filed it minor. It lands on both leads at once — voice is the
// differentiator and ADHD students are the audience — because a student who cannot follow
// the pace does not get a slower coach, they turn the voice OFF. Then the product is a text
// chatbot for exactly the students it was built for.
//
// 🔴 The rate is applied with HTMLMediaElement.playbackRate, NEVER ElevenLabs `speed`.
// ElevenLabs bills per character, so a pace control that re-synthesises makes experimenting
// cost money, cannot change a line already playing, and its support on eleven_turbo_v2_5 is
// unverified. playbackRate is free, instant, and works mid-sentence — which is the whole
// point: a student discovering the coach is too fast should fix it DURING the sentence that
// is too fast. `voice_settings` (stability / style / similarity_boost) is left alone; those
// shape WHO the coach sounds like, not how fast.
//
// PURE. The DOM mutation lives in applyPlaybackRate, which takes the element.

// Tap-to-cycle presets, SLOWER FIRST. Podcast apps lead with faster because their users
// speed things up; these students slow down, and a cycle that leads with 1.25× buries the
// accessibility case three taps deep.
export const PACE_PRESETS = [1, 0.75, 0.5, 1.25, 1.5]

export const DEFAULT_PACE = 1
// The column's CHECK constraint. Kept here so the client, the API and the migration cannot
// drift on it — and so a value from a future slider (the spec's other entry point, owned by
// focus/assignment-intake) is accepted rather than snapped to a preset it never chose.
export const MIN_PACE = 0.5
export const MAX_PACE = 2.0

/**
 * Clamp anything into a rate that is safe to hand an <audio> element.
 *
 * ⚠️ `null` and `''` are rejected BEFORE the clamp, not after. `Number(null)` is 0, which is
 * finite, so a naive clamp turns "no preference set" into MIN_PACE — every student whose
 * `coach_pace` is null (the column freshly added, a row not yet backfilled, a profile read
 * that omitted it) would get the SLOWEST coach without ever choosing it. Caught by a test,
 * not by reading.
 */
export function normalizePace(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return DEFAULT_PACE
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_PACE
  return Math.min(MAX_PACE, Math.max(MIN_PACE, n))
}

/** Whether a value may be written to profiles.coach_pace. The API rejects rather than
 *  silently clamping: storing a rate the student did not choose is a quiet wrong answer. */
export function isValidPace(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= MIN_PACE && n <= MAX_PACE
}

/**
 * The next preset in the cycle.
 *
 * A rate that is not a preset — set by the slider entry point — snaps to the NEAREST preset
 * first, so one tap always produces a predictable, on-list rate rather than jumping to the
 * head of the cycle and appearing to discard the student's setting.
 */
export function nextPace(current) {
  const cur = normalizePace(current)
  const i = PACE_PRESETS.indexOf(cur)
  if (i !== -1) return PACE_PRESETS[(i + 1) % PACE_PRESETS.length]
  let nearest = 0
  for (let k = 1; k < PACE_PRESETS.length; k++) {
    if (Math.abs(PACE_PRESETS[k] - cur) < Math.abs(PACE_PRESETS[nearest] - cur)) nearest = k
  }
  return PACE_PRESETS[nearest]
}

/** The face of the button: "1×", "0.75×". Short enough for a 44px target. */
export function paceFace(value) {
  const n = normalizePace(value)
  return `${Number.isInteger(n) ? n : String(n).replace(/0+$/, '').replace(/\.$/, '')}×`
}

/**
 * Plain words for the aria-label — a student who needs this should not have to reason
 * about multipliers, and a screen-reader user gets no help at all from "1.25×".
 */
export function paceWords(value) {
  const n = normalizePace(value)
  if (n < 0.7) return 'much slower'
  if (n < 1) return 'slower'
  if (n === 1) return 'normal speed'
  if (n < 1.4) return 'faster'
  return 'much faster'
}

export function paceAriaLabel(value) {
  return `Coach speaking pace: ${paceWords(value)}. Tap to change to ${paceWords(nextPace(value))}.`
}

/**
 * Apply a rate to a live media element.
 *
 * ⚠️ Three traps, all of them recorded in the spec because this is the most fragile area in
 * the repo:
 *
 *  1. **playbackRate does not survive a source change.** Setting it once at mount and
 *     assuming it sticks is the bug this ships with otherwise — so callers must re-apply on
 *     EVERY play, after `el.src = …`, not once. (Tested: see coachPace.test.js.)
 *  2. **preservesPitch must be set explicitly**, with the webkit alias for Safari. Without
 *     it a slowed coach sounds drunk and a sped-up one sounds like a chipmunk, which a
 *     student reads as "the voice is broken", not "the voice is slower".
 *  3. **Never pause or reload to apply it.** Mutating the live element is the entire reason
 *     playbackRate was chosen; CLAUDE.md records that pausing on a gesture previously cut
 *     the coach off when a student merely scrolled.
 *
 * Returns the rate actually applied, or null if there was no element.
 */
export function applyPlaybackRate(el, pace) {
  if (!el) return null
  const rate = normalizePace(pace)
  try {
    // Pitch first: setting the rate before the pitch flag leaves one frame at the wrong
    // pitch on some engines, which is audible as a chirp at the start of a line.
    if ('preservesPitch' in el) el.preservesPitch = true
    if ('webkitPreservesPitch' in el) el.webkitPreservesPitch = true
    el.playbackRate = rate
  } catch {
    return null   // a detached or dead element — never let a pace change break playback
  }
  return rate
}

/**
 * Wall-clock duration of a clip once the rate is applied.
 *
 * The word-sync caption is driven from `el.duration`, which is the clip's length at 1×. At
 * 0.5× the audio takes twice as long, so an unscaled caption finishes while the coach is
 * still halfway through the sentence — the captions silently desyncing for exactly the
 * students who turned the pace down to follow along. Not in the spec; found by reading the
 * playback path.
 */
export function scaleDurationMs(durationMs, pace) {
  const ms = Number(durationMs)
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return ms / normalizePace(pace)
}
