'use client'

import { useState, useRef, useEffect } from 'react'
import MicButton from './MicButton'

export default function TutorSession({ session, initialMessages = [] }) {
  const [messages, setMessages] = useState(initialMessages)
  const [paragraphs, setParagraphs] = useState([])
  const [tutorText, setTutorText] = useState('')
  const [pendingScribe, setPendingScribe] = useState(null) // { paragraph, rawText, isThin, thinNote }
  const [phase, setPhase] = useState('waiting') // waiting | tutor-thinking | listening | scribe-thinking | preview
  const chatBottomRef = useRef(null)

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, tutorText])

  // Kick off the first tutor question on mount
  useEffect(() => {
    if (messages.length === 0) askTutor([])
  }, [])

  async function askTutor(history) {
    setPhase('tutor-thinking')
    setTutorText('')

    const res = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.id,
        assignment: session.assignment_text,
        messages: history,
      }),
    })

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let full = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      full += chunk
      setTutorText(full)
    }

    const newMessages = [...history, { role: 'assistant', content: full }]
    setMessages(newMessages)
    setTutorText('')
    setPhase('listening')

    // Speak the tutor's question
    speakText(full)
  }

  function speakText(text) {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.95
    window.speechSynthesis.speak(utterance)
  }

  async function handleTranscript(spokenText) {
    setPhase('scribe-thinking')

    // Add user message
    const userMessage = { role: 'user', content: spokenText }
    const newHistory = [...messages, userMessage]

    // Persist user message
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id, role: 'user', content: spokenText }),
    })

    // Scribe call
    const scribeRes = await fetch('/api/scribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spokenText, sessionId: session.id }),
    })
    const scribed = await scribeRes.json()

    setMessages(newHistory)
    setPendingScribe({ paragraph: scribed.paragraph, rawText: spokenText, isThin: scribed.isThin, thinNote: scribed.thinNote })
    setPhase('preview')
  }

  async function approveParagraph() {
    const position = paragraphs.length
    const { paragraph, rawText, isThin } = pendingScribe

    await fetch('/api/paragraphs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.id,
        scribedText: paragraph,
        rawSpokenText: rawText,
        position,
        isThin,
      }),
    })

    setParagraphs([...paragraphs, { scribed_text: paragraph, is_thin: isThin }])
    setPendingScribe(null)
    askTutor(messages)
  }

  async function editParagraph(editedText) {
    const position = paragraphs.length
    const { rawText, isThin } = pendingScribe

    await fetch('/api/paragraphs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.id,
        scribedText: editedText,
        rawSpokenText: rawText,
        position,
        isThin,
      }),
    })

    setParagraphs([...paragraphs, { scribed_text: editedText, is_thin: isThin }])
    setPendingScribe(null)
    askTutor(messages)
  }

  function discardParagraph() {
    setPendingScribe(null)
    setPhase('listening')
  }

  const fullEssay = paragraphs.map(p => p.scribed_text).join('\n\n')

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Left: Chat panel */}
      <div className="flex flex-col w-1/2 border-r border-gray-200 bg-white">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">B</div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">BrainScribe Tutor</p>
            <p className="text-xs text-gray-400 truncate max-w-xs">{session.assignment_text.slice(0, 60)}…</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`rounded-2xl px-4 py-3 max-w-xs text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}>
                {m.content}
              </div>
            </div>
          ))}

          {tutorText && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm px-4 py-3 max-w-xs text-sm leading-relaxed bg-gray-100 text-gray-800">
                {tutorText}
                <span className="animate-pulse">▋</span>
              </div>
            </div>
          )}

          {phase === 'scribe-thinking' && (
            <div className="flex justify-center">
              <p className="text-xs text-gray-400 italic">Scribing your answer…</p>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Preview banner */}
        {phase === 'preview' && pendingScribe && (
          <ParagraphPreview
            paragraph={pendingScribe.paragraph}
            isThin={pendingScribe.isThin}
            thinNote={pendingScribe.thinNote}
            onApprove={approveParagraph}
            onEdit={editParagraph}
            onDiscard={discardParagraph}
          />
        )}

        {/* Mic */}
        {phase === 'listening' && (
          <div className="p-5 border-t border-gray-100 flex flex-col items-center gap-2">
            <MicButton onTranscript={handleTranscript} disabled={false} />
            <p className="text-xs text-gray-400">Tap to speak your answer</p>
          </div>
        )}

        {phase === 'tutor-thinking' && (
          <div className="p-5 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400 italic">Tutor is thinking…</p>
          </div>
        )}
      </div>

      {/* Right: Document panel */}
      <div className="flex flex-col w-1/2 bg-white">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="font-semibold text-gray-700 text-sm">Your Essay</p>
          {paragraphs.length > 0 && (
            <button
              onClick={() => navigator.clipboard.writeText(fullEssay)}
              className="text-xs text-indigo-600 hover:underline"
            >
              Copy to clipboard
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {paragraphs.length === 0 ? (
            <p className="text-gray-300 text-sm italic">Your paragraphs will appear here as you build your essay…</p>
          ) : (
            <div className="space-y-5">
              {paragraphs.map((p, i) => (
                <p key={i} className={`text-gray-800 leading-relaxed text-[15px] ${p.is_thin ? 'opacity-60' : ''}`}>
                  {p.scribed_text}
                  {p.is_thin && <span className="ml-2 text-xs text-amber-500 italic">(thin — let's build on this)</span>}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ParagraphPreview({ paragraph, isThin, thinNote, onApprove, onEdit, onDiscard }) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(paragraph)

  return (
    <div className="border-t border-indigo-100 bg-indigo-50 p-4 space-y-3">
      <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Scribed paragraph — review</p>

      {isThin && thinNote && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">{thinNote}</p>
      )}

      {editing ? (
        <textarea
          value={editText}
          onChange={e => setEditText(e.target.value)}
          className="w-full text-sm rounded-xl border border-indigo-200 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
          rows={4}
        />
      ) : (
        <p className="text-sm text-gray-800 leading-relaxed">{paragraph}</p>
      )}

      <div className="flex gap-2">
        {editing ? (
          <>
            <button onClick={() => onEdit(editText)} className="flex-1 bg-indigo-600 text-white text-xs rounded-lg py-2 hover:bg-indigo-700">Save edits</button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-500 px-3 hover:underline">Cancel</button>
          </>
        ) : (
          <>
            <button onClick={onApprove} className="flex-1 bg-indigo-600 text-white text-xs rounded-lg py-2 hover:bg-indigo-700">Add to essay ✓</button>
            <button onClick={() => setEditing(true)} className="flex-1 border border-indigo-300 text-indigo-700 text-xs rounded-lg py-2 hover:bg-indigo-100">Edit</button>
            <button onClick={onDiscard} className="text-xs text-gray-400 px-2 hover:underline">Discard</button>
          </>
        )}
      </div>
    </div>
  )
}
