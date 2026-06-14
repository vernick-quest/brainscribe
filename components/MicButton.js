'use client'

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
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

function MicButton({ onInterim, onFinal, disabled, assignmentKeyterms = [] }, ref) {
  const [listening, setListening] = useState(false)
  const [starting, setStarting] = useState(false)
  const connectionRef = useRef(null)
  const finalTextRef = useRef('')
  const readyTimerRef = useRef(null)

  function clearReadyTimer() {
    if (readyTimerRef.current) { clearTimeout(readyTimerRef.current); readyTimerRef.current = null }
  }

  useEffect(() => {
    return () => {
      clearReadyTimer()
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

  // Imperative stop — closes the mic WITHOUT firing onFinal. Used when the
  // student starts editing the transcribed text: we kill the mic so it stops
  // overwriting their edits, but we must not submit or clobber what they typed.
  function stopSilently() {
    clearReadyTimer()
    const conn = connectionRef.current
    if (!conn) return
    connectionRef.current = null
    finalTextRef.current = ''
    setListening(false)
    setStarting(false)
    safeClose(conn)
  }
  useImperativeHandle(ref, () => ({ stop: stopSilently, isActive: () => !!connectionRef.current }), [])

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

      // The "ready to speak" state must wait for SESSION_STARTED — the server's
      // signal that the transcription session is live. OPEN only means the
      // WebSocket handshake finished; audio sent between OPEN and SESSION_STARTED
      // isn't transcribed, which dropped the user's first words. We still keep an
      // OPEN-driven fallback timer so the button can't get stuck "connecting" if
      // SESSION_STARTED is ever missed.
      connection.on(RealtimeEvents.OPEN, () => {
        clearReadyTimer()
        readyTimerRef.current = setTimeout(() => {
          setStarting(false)
          setListening(true)
        }, 1500)
      })

      connection.on(RealtimeEvents.SESSION_STARTED, () => {
        clearReadyTimer()
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
        clearReadyTimer()
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
    clearReadyTimer()
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
    <div className="relative shrink-0">
      {/* Expanding "live" halo — only while actually listening, so it's clearly
          distinct from the gentle connecting pulse. */}
      {listening && (
        <>
          <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: 'var(--status-error)', opacity: 0.4 }} />
          <span className="absolute -inset-1 rounded-full" style={{ border: '2px solid var(--status-error)', opacity: 0.6 }} />
        </>
      )}
      <button
        onClick={busy ? stopListening : startListening}
        disabled={disabled}
        className="relative w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ backgroundColor: listening ? 'var(--status-error)' : starting ? 'var(--accent-hover)' : 'var(--accent)' }}
        title={listening ? 'Listening — tap to stop' : starting ? 'Connecting…' : 'Tap to speak'}
        aria-label={listening ? 'Listening — tap to stop' : starting ? 'Connecting' : 'Tap to speak'}
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
    </div>
  )
}

export default forwardRef(MicButton)
