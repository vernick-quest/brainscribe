import { useCallback, useEffect, useRef } from 'react'
import { applyPlaybackRate, normalizePace } from '@/lib/coachPace'
import { createSpeechStream } from '@/lib/speechStream'

// Speaks coach lines via /api/speak through a single, gesture-unlocked <audio>
// element. Mobile (and desktop autoplay policies) block audio until the user has
// interacted with the page, so we prime the element on the first pointer/key
// event. Used by the onboarding screens so Owen can talk the student through.
//
// `pace` is the student's coach_pace (SPEC-coach-pace.md). It reaches the element via
// HTMLMediaElement.playbackRate, never ElevenLabs `speed` — free, instant, changeable
// mid-utterance, and not billed per character on every adjustment.
export function useCoachVoice(persona = 'owen', pace = 1) {
  const audioRef    = useRef(null)
  const seqRef      = useRef(0)
  // The line's sentence queue (lib/speechStream). Cancelled on stop / a new line, so
  // nothing queued plays late and a late-resolving fetch is revoked, never played.
  const streamRef   = useRef(null)
  // Read at PLAY time, which is many renders after a change — a render closure would play
  // the old rate. Assigned in an effect so a render React discards can't leave it holding
  // a value that was never committed.
  const paceRef     = useRef(normalizePace(pace))
  useEffect(() => { paceRef.current = normalizePace(pace) }, [pace])

  function getEl() {
    if (!audioRef.current) {
      const el = new Audio()
      el.preload = 'auto'
      audioRef.current = el
    }
    return audioRef.current
  }

  // On the first user gesture, RESUME a line that was blocked from autoplaying
  // (mobile silently blocks audio until a gesture) — we're inside the gesture now,
  // so play() is allowed. Crucially, if audio is already playing we leave it alone:
  // the old code paused on every first gesture, which cut the coach off when the
  // student so much as scrolled. The blocked clip's blob URL isn't revoked until it
  // ends, so it's still valid to replay here.
  useEffect(() => {
    function unlock() {
      const el = audioRef.current
      if (el && el.paused && el.src) el.play().catch(() => {})
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // Mutate the live element when the pace changes mid-line. Never pause and never reload:
  // that is the whole reason playbackRate was chosen, and CLAUDE.md records that pausing on
  // a gesture previously cut the coach off when a student merely scrolled.
  useEffect(() => { applyPlaybackRate(audioRef.current, normalizePace(pace)) }, [pace])

  // Release the current line: cancel its queue (no further fetch or play; late fetches
  // are revoked). The clip already on the element is left alone — a new line replaces it
  // by setting src, exactly as before, and its blob URL is only revoked once it ends
  // (revoking a URL mid-play can cut it off where the engine range-reads the blob).
  function release() {
    if (streamRef.current) { streamRef.current.cancel(); streamRef.current = null }
  }

  const stop = useCallback(() => {
    seqRef.current++
    release()
    const el = audioRef.current
    if (el) { el.pause(); el.currentTime = 0 }
  }, [])

  // Plays one clip on the single unlocked element and resolves when it ENDS (or errors).
  // Deliberately NOT on a rejected play(): a line blocked from
  // autoplaying stays loaded, the first-gesture unlock above resumes it, and its `ended`
  // then carries the queue on to the next sentence — rather than skipping ahead to a
  // sentence that would be blocked too.
  function playUrl(url) {
    return new Promise((resolve) => {
      const el = getEl()
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        el.removeEventListener('ended', finish)
        el.removeEventListener('error', finish)
        resolve()
      }
      el.addEventListener('ended', finish)
      el.addEventListener('error', finish)
      el.src = url
      // ⚠️ AFTER `el.src`, on EVERY play. playbackRate does not reliably survive a source
      // change, so setting it once at mount holds for one utterance and silently reverts
      // to 1× on the next — the bug this ships with otherwise (spec, trap 1). With one
      // clip per sentence this runs per sentence, not per line.
      // applyPlaybackRate also sets preservesPitch/webkitPreservesPitch: without them a
      // slowed coach sounds drunk, which a student reads as broken rather than slower.
      applyPlaybackRate(el, paceRef.current)
      el.play().catch(() => {})
    })
  }

  // Speak a line sentence by sentence: the first short clip synthesises fast, so the
  // voice starts sooner on a long line; the rest is fetched while it plays. Total
  // characters sent are the line's own — chunks partition it.
  const speak = useCallback(async (text) => {
    if (!text) return
    const seq = ++seqRef.current
    release()
    const stream = createSpeechStream({
      synth: async (chunk) => {
        const res = await fetch('/api/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunk, persona }),
        })
        if (!res.ok) throw new Error(`TTS ${res.status}`)
        const blob = await res.blob()
        return URL.createObjectURL(blob)
      },
      play:   playUrl,
      revoke: (url) => { try { URL.revokeObjectURL(url) } catch {} },
      isLive: () => seqRef.current === seq,
    })
    streamRef.current = stream
    stream.end(text)
    await stream.done
  }, [persona])

  // Stop any audio when the screen using this hook unmounts.
  useEffect(() => stop, [stop])

  return { speak, stop }
}
