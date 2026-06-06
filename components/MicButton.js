'use client'

import { useState, useRef, useEffect } from 'react'

export default function MicButton({ onTranscript, disabled }) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Try Chrome.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    let transcript = ''
    recognition.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) transcript += e.results[i][0].transcript + ' '
      }
    }

    recognition.onend = () => {
      setListening(false)
      if (transcript.trim()) onTranscript(transcript.trim())
    }

    recognition.start()
    setListening(true)
  }

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      className={`
        w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all
        ${listening
          ? 'bg-red-500 hover:bg-red-600 animate-pulse'
          : 'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed'
        }
      `}
      title={listening ? 'Tap to stop' : 'Tap to speak'}
    >
      <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
        {listening ? (
          <rect x="6" y="6" width="12" height="12" rx="2" />
        ) : (
          <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.5 9a.5.5 0 0 1 .5.5 7 7 0 0 1-6.5 6.97V20h2.5a.5.5 0 0 1 0 1h-6a.5.5 0 0 1 0-1H11v-2.53A7 7 0 0 1 4.5 10.5a.5.5 0 0 1 1 0 6 6 0 0 0 12 0 .5.5 0 0 1 .5-.5z" />
        )}
      </svg>
    </button>
  )
}
