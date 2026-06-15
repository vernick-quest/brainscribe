import { useCallback, useEffect, useRef } from 'react'

// Speaks coach lines via /api/speak through a single, gesture-unlocked <audio>
// element. Mobile (and desktop autoplay policies) block audio until the user has
// interacted with the page, so we prime the element on the first pointer/key
// event. Used by the onboarding screens so Owen can talk the student through.
export function useCoachVoice(persona = 'owen') {
  const audioRef    = useRef(null)
  const seqRef      = useRef(0)

  function getEl() {
    if (!audioRef.current) {
      const el = new Audio()
      el.preload = 'auto'
      audioRef.current = el
    }
    return audioRef.current
  }

  // Prime the audio element on the first user gesture so later play() calls aren't
  // blocked by the browser's autoplay policy.
  useEffect(() => {
    function unlock() {
      const el = getEl()
      el.play().then(() => { el.pause(); el.currentTime = 0 }).catch(() => {})
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const stop = useCallback(() => {
    seqRef.current++
    const el = audioRef.current
    if (el) { el.pause(); el.currentTime = 0 }
  }, [])

  const speak = useCallback(async (text) => {
    if (!text) return
    const seq = ++seqRef.current
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, persona }),
      })
      if (!res.ok || seqRef.current !== seq) return
      const blob = await res.blob()
      if (seqRef.current !== seq) return
      const url = URL.createObjectURL(blob)
      const el = getEl()
      el.onended = () => URL.revokeObjectURL(url)
      el.src = url
      await el.play().catch(() => {})
    } catch {}
  }, [persona])

  // Stop any audio when the screen using this hook unmounts.
  useEffect(() => stop, [stop])

  return { speak, stop }
}
