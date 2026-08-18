import { describe, it, expect } from 'vitest'
import {
  PACE_PRESETS, DEFAULT_PACE, MIN_PACE, MAX_PACE,
  normalizePace, isValidPace, nextPace, paceFace, paceWords, paceAriaLabel,
  applyPlaybackRate, scaleDurationMs,
} from '@/lib/coachPace'

// A stand-in for the one gesture-unlocked <audio> element the session shares.
function fakeAudio(overrides = {}) {
  return { playbackRate: 1, preservesPitch: false, webkitPreservesPitch: false, src: '', ...overrides }
}

describe('the cycle leads with SLOWER — the accessibility case comes first', () => {
  it('is exactly the five presets, slower first', () => {
    expect(PACE_PRESETS).toEqual([1, 0.75, 0.5, 1.25, 1.5])
  })

  it('one tap from normal makes the coach SLOWER, not faster', () => {
    expect(nextPace(1)).toBe(0.75)
  })

  it('cycles through every preset and returns to the start', () => {
    const seen = [1]
    let p = 1
    for (let i = 0; i < PACE_PRESETS.length; i++) { p = nextPace(p); seen.push(p) }
    expect(seen).toEqual([1, 0.75, 0.5, 1.25, 1.5, 1])
  })

  // The slider entry point (focus/assignment-intake) can write any value in range; a tap
  // must not appear to discard it by jumping to the head of the cycle.
  it('an off-preset rate snaps to the NEAREST preset, not to the head', () => {
    expect(nextPace(0.8)).toBe(0.75)
    expect(nextPace(1.9)).toBe(1.5)
    expect(nextPace(1.1)).toBe(1)
  })
})

describe('normalizePace / isValidPace — nothing unsafe reaches the element', () => {
  it('clamps to the column\'s CHECK range', () => {
    expect(normalizePace(0.1)).toBe(MIN_PACE)
    expect(normalizePace(9)).toBe(MAX_PACE)
  })
  // ⚠️ THE ONE THAT BIT. Number(null) is 0, which is finite, so a naive clamp turns "no
  // preference" into the SLOWEST rate — every student with a null coach_pace would get a
  // half-speed coach they never asked for.
  it('falls back to normal speed on anything unusable, INCLUDING null and empty string', () => {
    for (const v of [null, undefined, '', NaN, 'fast', {}, Infinity, true, false]) {
      expect(normalizePace(v)).toBe(DEFAULT_PACE)
    }
  })
  it('accepts a numeric string, because a DB numeric can arrive as one', () => {
    expect(normalizePace('0.75')).toBe(0.75)
  })
  it('isValidPace REJECTS out-of-range rather than clamping — the API must not store a rate the student never chose', () => {
    expect(isValidPace(0.5)).toBe(true)
    expect(isValidPace(2)).toBe(true)
    expect(isValidPace(0.4)).toBe(false)
    expect(isValidPace(2.1)).toBe(false)
    expect(isValidPace('quick')).toBe(false)
    expect(isValidPace(null)).toBe(false)
  })
})

describe('labels — the face is short, the aria-label is plain words', () => {
  it('shows the rate on the face', () => {
    expect(paceFace(1)).toBe('1×')
    expect(paceFace(0.75)).toBe('0.75×')
    expect(paceFace(0.5)).toBe('0.5×')
    expect(paceFace(1.25)).toBe('1.25×')
  })
  it('says it in words for a screen reader, never in multipliers', () => {
    expect(paceWords(0.5)).toBe('much slower')
    expect(paceWords(0.75)).toBe('slower')
    expect(paceWords(1)).toBe('normal speed')
    expect(paceWords(1.25)).toBe('faster')
    expect(paceWords(1.5)).toBe('much faster')
  })
  it('the aria-label names the current pace AND what a tap will do', () => {
    expect(paceAriaLabel(1)).toBe('Coach speaking pace: normal speed. Tap to change to slower.')
    expect(paceAriaLabel(1.5)).toBe('Coach speaking pace: much faster. Tap to change to normal speed.')
    expect(paceAriaLabel(1)).not.toMatch(/×|[0-9]/)
  })
})

// ⚠️ Trap 2 from the spec: without preservesPitch a slowed coach sounds drunk, which a
// student reads as "the voice is broken" rather than "the voice is slower".
describe('applyPlaybackRate — pitch, rate, and never throwing', () => {
  it('sets the rate AND both pitch flags', () => {
    const el = fakeAudio()
    expect(applyPlaybackRate(el, 0.5)).toBe(0.5)
    expect(el.playbackRate).toBe(0.5)
    expect(el.preservesPitch).toBe(true)
    expect(el.webkitPreservesPitch).toBe(true)
  })

  it('clamps whatever it is handed', () => {
    const el = fakeAudio()
    applyPlaybackRate(el, 99)
    expect(el.playbackRate).toBe(MAX_PACE)
  })

  it('is a no-op on a missing element rather than throwing', () => {
    expect(applyPlaybackRate(null, 1.5)).toBeNull()
    expect(applyPlaybackRate(undefined, 1.5)).toBeNull()
  })

  it('survives a dead element — a pace change must never break playback', () => {
    const dead = { set playbackRate(_) { throw new Error('InvalidStateError') } }
    expect(applyPlaybackRate(dead, 1.25)).toBeNull()
  })

  it('does not touch the element beyond rate and pitch — never pause, never reload', () => {
    // Trap 3: pausing to apply the setting is what previously cut the coach off when a
    // student merely scrolled. Anything this function calls, it calls on every utterance.
    const calls = []
    const el = new Proxy(fakeAudio(), {
      get: (t, k) => { if (typeof t[k] === 'function') calls.push(k); return t[k] },
      set: (t, k, v) => { t[k] = v; return true },
    })
    applyPlaybackRate(el, 0.5)
    expect(calls).toEqual([])
  })

  // ⚠️ Trap 1, the one the spec says this ships broken without: playbackRate does not
  // reliably survive a source change, so it must be re-applied AFTER el.src is set.
  it('re-applying after a source change restores the rate', () => {
    const el = fakeAudio()
    applyPlaybackRate(el, 0.5)
    expect(el.playbackRate).toBe(0.5)
    // Model a browser that resets the rate when the source changes.
    el.src = 'blob:next-utterance'
    el.playbackRate = 1
    expect(applyPlaybackRate(el, 0.5)).toBe(0.5)
    expect(el.playbackRate).toBe(0.5)
  })
})

// Not in the spec — found by reading the playback path. The word-sync caption is driven
// from el.duration, which is the clip's length at 1×.
describe('scaleDurationMs — the caption must not desync at a changed pace', () => {
  it('a half-speed clip takes twice as long', () => {
    expect(scaleDurationMs(4000, 0.5)).toBe(8000)
  })
  it('a 1.5× clip finishes sooner', () => {
    expect(scaleDurationMs(3000, 1.5)).toBe(2000)
  })
  it('is unchanged at normal speed', () => {
    expect(scaleDurationMs(3000, 1)).toBe(3000)
  })
  it('never returns NaN or a negative from a missing duration', () => {
    for (const v of [undefined, null, NaN, 0, -1, 'x']) expect(scaleDurationMs(v, 0.5)).toBe(0)
  })
})
