'use client'

// Entry point for a parent/teacher (or any account) to write their own piece with
// a coach, plus a compact list of what they've already written. Shown on the parent
// and teacher dashboards. The rows mirror the student assignment list's visual
// language (persona avatar + coach·date meta + status dot) so this reads as a
// smaller sibling of that list, not a foreign element — and the list is capped so a
// heavy account never turns it into a wall.

import { useState, useEffect } from 'react'
import { getPersona, PersonaAvatar } from '@/lib/personas'

const PREVIEW_COUNT = 3

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const diffDays = Math.floor((new Date() - date) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Client-computed so the relative label ("Today"/"Yesterday") can't cause a
// server/client hydration mismatch.
function RowDate({ dateStr }) {
  const [label, setLabel] = useState('')
  useEffect(() => { setLabel(formatDate(dateStr)) }, [dateStr])
  return <span suppressHydrationWarning>{label}</span>
}

function WritingRow({ session }) {
  const done = session.status === 'complete'
  const coach = getPersona(session.persona)
  const title = session.title || session.assignment_text?.slice(0, 70) || 'Untitled'
  return (
    <a
      href={done ? `/transcript/${session.id}` : `/assignment/${session.id}`}
      className="flex items-center transition"
      style={{
        gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)',
        backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-xs)', borderRadius: 'var(--radius-md)',
      }}
    >
      <PersonaAvatar personaId={session.persona} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </p>
        <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {coach.name} · <RowDate dateStr={session.updated_at} />
        </p>
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, font: 'var(--type-meta)', color: done ? 'var(--status-success)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: done ? 'var(--status-success)' : 'var(--navy-500)' }} />
        {done ? 'Complete' : 'In progress'}
      </span>
    </a>
  )
}

export default function YourWritingCard({ ownSessions = [] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? ownSessions : ownSessions.slice(0, PREVIEW_COUNT)
  const overflow = ownSessions.length - PREVIEW_COUNT

  return (
    <section className="rounded-2xl p-5"
      style={{ backgroundColor: 'var(--surface-spark)', border: '1px solid var(--border-accent)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Your writing</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Want to write something yourself? Same coaches, same flow.
          </p>
        </div>
        <a href="/write"
          className="text-sm font-semibold rounded-full px-4 py-2 text-white shrink-0 transition"
          style={{ backgroundColor: 'var(--accent)' }}>
          Write your own →
        </a>
      </div>

      {ownSessions.length > 0 && (
        <div className="mt-4 flex flex-col" style={{ gap: 'var(--space-2)' }}>
          {shown.map(s => <WritingRow key={s.id} session={s} />)}

          {overflow > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="self-start transition"
              style={{ font: 'var(--type-meta)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-link)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px' }}>
              {expanded ? 'Show less' : `Show all ${ownSessions.length} →`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
