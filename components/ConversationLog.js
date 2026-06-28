'use client'

import { useState } from 'react'
import { PersonaAvatar } from '@/lib/personas'

// Read-only conversation transcript. A finished assignment can carry a very
// long back-and-forth; past ~30 messages we collapse it behind a toggle so the
// page doesn't open as an endless scroll. All messages stay in the DOM (the
// collapsed wrapper just clamps height + fades), so the @media print block can
// force the full conversation back open — print captures everything.
const COLLAPSE_THRESHOLD = 30

export default function ConversationLog({ messages, persona }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = messages.length > COLLAPSE_THRESHOLD
  const collapsed = isLong && !expanded

  return (
    <>
      <div
        className={`conversation-log space-y-4 ${collapsed ? 'conversation-collapsed' : ''}`}
      >
        {messages.map((m, i) => {
          const isCoach = m.role === 'assistant'
          return (
            <div key={i} className={`flex ${isCoach ? 'justify-start' : 'justify-end'}`}>
              {isCoach && (
                <PersonaAvatar personaId={persona} size={28} className="mr-1 mt-0.5 shrink-0" />
              )}
              <div className="chat-bubble rounded-2xl px-4 py-3 max-w-lg text-sm leading-relaxed"
                style={isCoach
                  ? { backgroundColor: 'var(--surface-muted)', color: 'var(--text-body)', borderBottomLeftRadius: 4 }
                  : { backgroundColor: 'var(--primary)', color: 'var(--text-on-dark)', borderBottomRightRadius: 4 }
                }>
                {m.content}
              </div>
            </div>
          )
        })}
      </div>

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="conversation-toggle no-print text-xs font-semibold hover:underline"
          style={{ color: 'var(--accent-text)' }}
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : `Show full conversation (${messages.length} messages)`}
        </button>
      )}
    </>
  )
}
