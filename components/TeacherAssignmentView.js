'use client'

import { useState } from 'react'
import WritingProfileCard from '@/components/WritingProfileCard'
import Navbar from '@/components/Navbar'

import { getPersona, PersonaAvatar } from '@/lib/personas'

function formatDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 rounded-full p-1 w-fit"
      style={{ backgroundColor: 'var(--surface-muted)' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="text-xs font-semibold px-4 py-1.5 rounded-full transition"
          style={{
            backgroundColor: active === t.id ? 'var(--surface-card)' : 'transparent',
            color: active === t.id ? 'var(--text-strong)' : 'var(--text-muted)',
            boxShadow: active === t.id ? 'var(--shadow-xs)' : 'none',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Essay tab ─────────────────────────────────────────────────
function EssayTab({ paragraphs, essay }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          {paragraphs?.length ?? 0} paragraph{paragraphs?.length !== 1 ? 's' : ''}
        </span>
        {essay && (
          <button
            onClick={() => navigator.clipboard.writeText(essay)}
            className="text-xs font-medium hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            Copy essay
          </button>
        )}
      </div>

      {!paragraphs?.length ? (
        <p className="text-sm italic py-8 text-center" style={{ color: 'var(--text-subtle)' }}>
          No paragraphs written yet.
        </p>
      ) : (
        <div className="space-y-5">
          {paragraphs.map((p, i) => (
            <div key={i} className="space-y-1">
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>
                {p.scribed_text}
              </p>
              {p.is_thin && (
                <p className="text-xs italic" style={{ color: 'var(--status-thin)' }}>
                  Thin paragraph — student was still developing this idea
                </p>
              )}
              <details>
                <summary className="text-xs cursor-pointer select-none"
                  style={{ color: 'var(--text-subtle)' }}>
                  Raw spoken text
                </summary>
                <p className="text-xs mt-1 rounded-lg p-2 font-mono"
                  style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface-muted)' }}>
                  {p.raw_spoken_text}
                </p>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Dialogue tab ──────────────────────────────────────────────
function DialogueTab({ messages, persona, studentFirstName }) {
  const visible = messages?.filter(m => m.role !== 'system') ?? []
  return (
    <div>
      {!visible.length ? (
        <p className="text-sm italic py-8 text-center" style={{ color: 'var(--text-subtle)' }}>
          No dialogue yet.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((m, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span
                className="shrink-0 font-semibold text-xs pt-0.5 w-16 text-right"
                style={{ color: m.role === 'assistant' ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {m.role === 'assistant' ? persona.name : studentFirstName ?? 'Student'}
              </span>
              <p className="flex-1 leading-relaxed" style={{ color: 'var(--text-body)' }}>
                {m.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


// ── Main ──────────────────────────────────────────────────────
export default function TeacherAssignmentView({ session, messages, paragraphs, studentName, user, writingProfile }) {
  const [tab, setTab] = useState('essay')
  const persona = getPersona(session.persona)
  const essay = paragraphs?.map(p => p.scribed_text).join('\n\n') ?? ''
  const isDone = session.status === 'complete'
  const studentFirst = studentName?.split(' ')[0]

  const TABS = [
    { id: 'essay',   label: 'Essay' },
    { id: 'dialogue', label: 'Dialogue' },
    { id: 'profile',  label: 'Writing Profile' },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>

      <Navbar user={user} profile={null} />
      <div className="px-6 py-2" style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-page)' }}>
        <a href="/teacher" className="text-xs font-medium hover:underline"
          style={{ color: 'var(--text-muted)' }}>
          ← Teacher dashboard
        </a>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">

        {/* Assignment meta card */}
        <div className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Assignment
              </p>
              <h1 className="text-xl font-bold leading-snug" style={{ color: 'var(--text-strong)' }}>
                {session.title || session.assignment_text?.slice(0, 80) + (session.assignment_text?.length > 80 ? '…' : '')}
              </h1>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <a
                href={`/transcript/${session.id}`}
                className="text-xs font-semibold hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                View transcript →
              </a>
              <span className="text-xs font-semibold rounded-full px-3 py-1"
                style={isDone
                  ? { backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }
                  : { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }
                }>
                {isDone ? '✓ Complete' : 'In progress'}
              </span>
            </div>
          </div>

          {/* Student + tutor + date */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ backgroundColor: 'var(--primary)' }}>
                {(studentName ?? '?')[0].toUpperCase()}
              </div>
              <span className="text-sm font-medium" style={{ color: 'var(--text-body)' }}>{studentName}</span>
            </div>
            <span style={{ color: 'var(--text-subtle)' }}>·</span>
            <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
              <PersonaAvatar personaId={session.persona} size={18} />
              {persona.name}
            </span>
            <span style={{ color: 'var(--text-subtle)' }}>·</span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {formatDate(session.updated_at ?? session.created_at)}
            </span>
          </div>

          {/* Full prompt — collapsed */}
          <details>
            <summary className="text-xs font-medium cursor-pointer select-none"
              style={{ color: 'var(--text-muted)' }}>
              View full prompt
            </summary>
            <p className="text-sm leading-relaxed mt-3 pt-3"
              style={{ color: 'var(--text-body)', borderTop: '1px solid var(--border-default)' }}>
              {session.assignment_text}
            </p>
          </details>
        </div>

        {/* Tabbed content */}
        <div className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>

          {/* Tab bar */}
          <div className="px-5 py-4"
            style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-page-alt)' }}>
            <TabBar tabs={TABS} active={tab} onChange={setTab} />
          </div>

          {/* Tab content */}
          <div className="p-6">
            {tab === 'essay'    && <EssayTab paragraphs={paragraphs} essay={essay} />}
            {tab === 'dialogue' && <DialogueTab messages={messages} persona={persona} studentFirstName={studentFirst} />}
            {tab === 'profile'  && (
              <WritingProfileCard
                profile={writingProfile ?? session.writing_profile ?? null}
                sessionComplete={session.status === 'complete'}
                studentName={studentFirst}
              />
            )}
          </div>
        </div>

      </main>
    </div>
  )
}
