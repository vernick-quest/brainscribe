import React from 'react'

function useStyle(id, css) {
  if (typeof document !== 'undefined' && !document.getElementById(id)) {
    const el = document.createElement('style')
    el.id = id
    el.textContent = css
    document.head.appendChild(el)
  }
}

const CSS = `
.bs-bubble-row { display: flex; gap: 10px; align-items: flex-end; width: 100%; }
.bs-bubble-row--tutor { justify-content: flex-start; }
.bs-bubble-row--student { justify-content: flex-end; }
.bs-bubble {
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: var(--leading-relaxed);
  max-width: 30rem;
  width: fit-content;
  padding: 13px 17px;
  border-radius: var(--radius-lg);
}
.bs-bubble--tutor {
  background: var(--surface-muted);
  color: var(--text-body);
  border-bottom-left-radius: var(--radius-xs);
  order: 2;
}
.bs-bubble-row--tutor .bs-bubble__speak { order: 1; }
.bs-bubble--student {
  background: var(--primary);
  color: var(--text-on-dark);
  border-bottom-right-radius: var(--radius-xs);
}
.bs-bubble--raw { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--ink-700); background: var(--cream-200); }

/* Read-along (karaoke) highlight — words light up as they're spoken */
.bs-bubble__w { border-radius: 5px; padding: 0 1px; transition: color var(--dur-fast) var(--ease-soft), background var(--dur-fast) var(--ease-soft); }
.bs-bubble.is-reading .bs-bubble__w { color: var(--text-subtle); }
.bs-bubble.is-reading .bs-bubble__w--said { color: var(--text-body); }
.bs-bubble.is-reading .bs-bubble__w--now {
  color: var(--orange-800);
  background: var(--accent-soft);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.bs-bubble__speak {
  flex-shrink: 0;
  width: 34px; height: 34px;
  border-radius: var(--radius-pill);
  border: 1.5px solid var(--border-default);
  background: var(--surface-card);
  color: var(--navy-700);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background var(--dur-base) var(--ease-soft), border-color var(--dur-base) var(--ease-soft);
}
.bs-bubble__speak:hover { background: var(--navy-50); border-color: var(--navy-300); }
.bs-bubble__speak.is-speaking {
  background: var(--accent-soft); border-color: var(--border-accent); color: var(--orange-700);
  animation: bs-speak-pulse 1.4s var(--ease-out) infinite;
}
.bs-bubble__speak svg { width: 16px; height: 16px; }
@keyframes bs-speak-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(240,129,30,0.0); }
  50% { box-shadow: 0 0 0 5px rgba(240,129,30,0.18); }
}
@media (prefers-reduced-motion: reduce) {
  .bs-bubble__speak.is-speaking { animation: none; }
}
.bs-bubble__caret { display: inline-block; width: 2px; margin-left: 2px; animation: bs-blink 1s steps(2) infinite; }
@keyframes bs-blink { 0%,50% { opacity: 1; } 50.01%,100% { opacity: 0; } }
`

/* Tokenize a string into words + whitespace, tracking each token's
   starting character offset so we can sync to speech boundaries. */
function tokenize(text) {
  const out = []
  let i = 0
  text.split(/(\s+)/).forEach((part) => {
    if (part.length) out.push({ text: part, start: i, ws: /^\s+$/.test(part) })
    i += part.length
  })
  return out
}

/**
 * A single chat message. Tutor messages sit left in a cream bubble with a
 * read-aloud button; student messages sit right in a navy bubble.
 *
 * When `speaking` is true (string children only), words highlight one at a
 * time as a read-along. Pass `spokenChar` to drive the highlight from real
 * SpeechSynthesis word-boundary events; omit it and the bubble estimates
 * the pace itself.
 */
export function ChatBubble({
  role = 'tutor', children, speaking = false, spokenChar = null,
  onSpeak, streaming = false, raw = false, className = '', ...rest
}) {
  useStyle('bs-bubble', CSS)
  const isTutor = role === 'tutor'
  const text = typeof children === 'string' ? children : null
  const canRead = !!text && isTutor

  // Estimated read-along progress. Runs whenever `speaking` so the highlight
  // never stalls; real `spokenChar` boundary events refine it (whichever is
  // further along wins).
  const [autoChar, setAutoChar] = React.useState(0)
  React.useEffect(() => {
    if (!canRead) return
    if (speaking) {
      setAutoChar(0)
      const total = text.length
      const start = performance.now()
      const charsPerSec = 13.5 // ~ natural reading pace
      let raf
      const tick = (t) => {
        const c = Math.min(total, ((t - start) / 1000) * charsPerSec)
        setAutoChar(c)
        if (c < total) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }
    setAutoChar(0)
  }, [speaking, canRead, text])

  const reading = canRead && speaking
  const cursor = Math.max(autoChar, spokenChar || 0)

  let content = children
  if (canRead) {
    const tokens = tokenize(text)
    content = tokens.map((tok, k) => {
      if (tok.ws) return tok.text
      const end = tok.start + tok.text.length
      let state = ''
      if (reading) {
        if (cursor >= end) state = 'bs-bubble__w--said'
        else if (cursor >= tok.start) state = 'bs-bubble__w--now'
      }
      return <span key={k} className={`bs-bubble__w ${state}`}>{tok.text}</span>
    })
  }

  return (
    <div className={`bs-bubble-row bs-bubble-row--${role} ${className}`} {...rest}>
      <div className={`bs-bubble bs-bubble--${role} ${raw ? 'bs-bubble--raw' : ''} ${reading ? 'is-reading' : ''}`}>
        {content}
        {streaming && <span className="bs-bubble__caret">▋</span>}
      </div>
      {isTutor && onSpeak && (
        <button
          className={`bs-bubble__speak ${speaking ? 'is-speaking' : ''}`}
          onClick={onSpeak}
          aria-label={speaking ? 'Stop reading aloud' : 'Read aloud'}
        >
          {speaking ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="3" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 5 6 9H3v6h3l5 4V5z" />
              <path d="M15.5 8.5a4 4 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M18 6a7 7 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}
