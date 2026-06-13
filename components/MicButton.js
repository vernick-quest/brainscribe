'use client'

import { useState, useRef, useEffect } from 'react'
import { Scribe, RealtimeEvents } from '@elevenlabs/client'

// Module-level patch — runs once when MicButton is first imported.
// The ElevenLabs SDK calls console.error() directly inside its WebSocket
// close handler for any non-1000 code, including the 1006 the browser
// generates on normal teardown. Suppressing it here means the filter is
// always active, regardless of component mount/unmount timing.
;(function suppressElevenLabsSocketNoise() {
  const original = console.error.bind(console)
  console.error = (...args) => {
    const msg = typeof args[0] === 'string' ? args[0] : ''
    if (msg.includes('WebSocket closed unexpectedly') && msg.includes('1006')) return
    original(...args)
  }
})()

export default function MicButton({ onInterim, onFinal, disabled, assignmentKeyterms = [] }) {
  const [listening, setListening] = useState(false)
  const [starting, setStarting] = useState(false)
  const connectionRef = useRef(null)
  const finalTextRef = useRef('')

  useEffect(() => {
    return () => {
      safeClose(connectionRef.current)
    }
  }, [])

  // Call _audioCleanup once ourselves, null it out, then let conn.close()
  // handle only the WebSocket — prevents AudioContext from closing twice.
  function safeClose(conn) {
    if (!conn) return
    if (conn._audioCleanup) {
      try { conn._audioCleanup() } catch {}
      conn._audioCleanup = null
    }
    try { conn.close() } catch {}
  }

  async function startListening() {
    if (starting || listening) return
    setStarting(true)

    try {
      const tokenRes = await fetch('/api/scribe-token', { method: 'POST' })
      const { token } = await tokenRes.json()
      if (!token) throw new Error('No token returned')

      finalTextRef.current = ''
      onInterim('')

      const connection = Scribe.connect({
        token,
        modelId: 'scribe_v2_realtime',
        noVerbatim: true,
        keyterms: assignmentKeyterms,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      })
      connectionRef.current = connection

      // Only switch to "listening" once the WebSocket is actually OPEN.
      // If the user taps stop before this fires, the socket is in CONNECTING
      // state and close() produces a 1006 — waiting for OPEN guarantees a
      // clean 1000 close whenever the user stops.
      connection.on(RealtimeEvents.OPEN, () => {
        setStarting(false)
        setListening(true)
      })

      connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data) => {
        onInterim((finalTextRef.current + ' ' + (data.text ?? '')).trim())
      })

      connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
        finalTextRef.current = (finalTextRef.current + ' ' + (data.text ?? '')).trim()
        onInterim(finalTextRef.current)
      })

      connection.on(RealtimeEvents.ERROR, (err) => {
        const msg = err?.message ?? ''
        if (!msg.includes('1006')) console.error('Scribe error:', err)
      })

      connection.on(RealtimeEvents.CLOSE, () => {
        // Covers both normal stop and any unexpected server-side close
        setListening(false)
        setStarting(false)
      })

    } catch (err) {
      console.error('Failed to start recording:', err)
      setListening(false)
      setStarting(false)
    }
  }

  function stopListening() {
    const conn = connectionRef.current
    connectionRef.current = null

    const finalText = finalTextRef.current.trim()
    finalTextRef.current = ''
    setListening(false)
    onFinal(finalText)

    safeClose(conn)
  }

  const busy = starting || listening
  return (
    <button
      onClick={busy ? stopListening : startListening}
      disabled={disabled}
      className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      style={{ backgroundColor: listening ? 'var(--status-error)' : starting ? 'var(--accent-hover)' : 'var(--accent)' }}
      title={listening ? 'Tap to stop' : starting ? 'Connecting…' : 'Tap to speak'}
    >
      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
        {listening ? (
          <rect x="6" y="6" width="12" height="12" rx="2" />
        ) : starting ? (
          <circle cx="12" cy="12" r="5" opacity="0.7">
            <animate attributeName="opacity" values="0.7;0.3;0.7" dur="1s" repeatCount="indefinite" />
          </circle>
        ) : (
          <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.5 9a.5.5 0 0 1 .5.5 7 7 0 0 1-6.5 6.97V20h2.5a.5.5 0 0 1 0 1h-6a.5.5 0 0 1 0-1H11v-2.53A7 7 0 0 1 4.5 10.5a.5.5 0 0 1 1 0 6 6 0 0 0 12 0 .5.5 0 0 1 .5-.5z" />
        )}
      </svg>
    </button>
  )
}
