'use client'

import { useEffect, useRef } from 'react'
import { shouldPing, PING_MS } from '@/lib/presence'

// Tells the server the user is still here.
//
// Mounted in Navbar, which every authenticated surface renders — including the
// coaching session — so this covers the case that motivated it without touching
// TutorSession.js. Renders nothing.
//
// Two gates, both necessary:
//   VISIBILITY — a background tab is not presence.
//   IDLE       — an open-but-abandoned tab must eventually stop reporting, or
//                everyone reads as permanently online, which is the usual way
//                naive heartbeats end up lying.
// Decision logic lives in lib/presence.js (pure + unit-tested); this is just wiring.
export default function PresenceHeartbeat({ enabled = true }) {
  const lastInputAt = useRef(Date.now())
  const lastPingAt = useRef(NaN)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const bump = () => { lastInputAt.current = Date.now() }
    // Passive: these must never delay scrolling or typing.
    const opts = { passive: true }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'focus']
    events.forEach(e => window.addEventListener(e, bump, opts))

    async function maybePing() {
      const visible = document.visibilityState === 'visible'
      if (!shouldPing({ visible, lastInputAt: lastInputAt.current, lastPingAt: lastPingAt.current })) return
      lastPingAt.current = Date.now()
      try {
        await fetch('/api/presence', { method: 'POST', cache: 'no-store', keepalive: true })
      } catch {
        // Offline or navigating away — presence is disposable, never surface this.
      }
    }

    // Ping on mount so a fresh page load registers immediately rather than after a
    // full interval, then on a timer.
    maybePing()
    const id = setInterval(maybePing, PING_MS)
    // Coming back to the tab is itself a presence signal worth reporting at once.
    const onVisible = () => { if (document.visibilityState === 'visible') { bump(); maybePing() } }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      events.forEach(e => window.removeEventListener(e, bump, opts))
    }
  }, [enabled])

  return null
}
