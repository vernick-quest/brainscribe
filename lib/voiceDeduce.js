// Pure, side-effect-free heuristic for the coach-voice auto-mute OFFER.
// NO React, NO fetch, NO timers — keyed off explicit audio-outcome events only, so
// it is deterministic, unit-testable (scripts/validate-voice-deduce.mjs), and can
// never false-fire on a genuine listener (their turns are `audio_completed`).
//
// Spec: docs/specs/brainscribe-coach-voice-toggle-spec.md §"Auto-mute heuristic".
//
// events: ordered per-coach-turn audio outcomes for the session, each one of:
//   'audio_completed'   — the read-aloud played fully to the end (a real listener)
//   'audio_skipped'     — the student sent/advanced before it finished
//   'audio_interrupted' — barge-in / stopCurrentAudio cut it short
//   'audio_absent'      — the coach turn produced no audio (voice already off) —
//                         explicitly does NOT count as a skip; ignored here.
// state: { voiceCurrentlyOn, offeredThisSession, dismissedForever }
//
// Rule (conservative): suggest muting ONLY when voice is currently on, we haven't
// already offered this session, the student hasn't permanently dismissed, AND the
// student skipped/interrupted the audio on >= 3 of the LAST 4 coach turns that HAD
// audio. A single skip (or one audio_absent) is never enough, and we require a full
// window of 4 audio-bearing turns to exist before we'll even consider it.

export const SKIP_OUTCOMES = ['audio_skipped', 'audio_interrupted']
export const AUDIO_OUTCOMES = ['audio_completed', ...SKIP_OUTCOMES]
export const WINDOW = 4
export const SKIP_THRESHOLD = 3

export function deduceVoiceSuggestion(events, state) {
  const {
    voiceCurrentlyOn = false,
    offeredThisSession = false,
    dismissedForever = false,
  } = state ?? {}

  // Gate: never suggest if voice is already off, or we already offered / were told
  // "don't ask again". Cheapest checks first.
  if (!voiceCurrentlyOn || offeredThisSession || dismissedForever) {
    return { suggest: false }
  }

  // Consider only turns that actually had audio (audio_absent doesn't count).
  const audioTurns = (events ?? []).filter(e => AUDIO_OUTCOMES.includes(e))

  // Need a full window before we'll offer — no firing on a 1–3 turn session.
  if (audioTurns.length < WINDOW) return { suggest: false }

  const lastWindow = audioTurns.slice(-WINDOW)
  const skips = lastWindow.filter(e => SKIP_OUTCOMES.includes(e)).length

  return { suggest: skips >= SKIP_THRESHOLD }
}
