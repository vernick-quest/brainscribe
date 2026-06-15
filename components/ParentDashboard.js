'use client'

import { useState } from 'react'
import WritingProfileCard from '@/components/WritingProfileCard'
import YourWritingCard from '@/components/YourWritingCard'
import Navbar from '@/components/Navbar'
import { getPersona, PersonaAvatar } from '@/lib/personas'
import { getSubject } from '@/lib/subjects'
import SubjectIcon from '@/components/SubjectIcon'


function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// ── Child avatar chip ─────────────────────────────────────────
function ChildChip({ child, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-2xl px-4 py-2.5 transition font-medium text-sm"
      style={{
        backgroundColor: selected ? 'var(--primary)' : 'var(--surface-card)',
        color: selected ? 'var(--text-on-dark)' : 'var(--text-strong)',
        border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border-default)'}`,
        boxShadow: selected ? 'var(--shadow-sm)' : 'none',
      }}
    >
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{
          backgroundColor: selected ? 'rgba(255,255,255,0.15)' : 'var(--primary-soft)',
          color: selected ? 'white' : 'var(--primary)',
        }}
      >
        {initials(child.full_name)}
      </span>
      {child.full_name?.split(' ')[0] ?? child.email}
    </button>
  )
}

// ── Assignment card ───────────────────────────────────────────
function AssignmentCard({ session }) {
  const label = session.title || session.assignment_text?.slice(0, 70) + (session.assignment_text?.length > 70 ? '…' : '')
  const isDone = session.status === 'complete'
  const subjectInfo = session.subject && session.subject !== 'unspecified' ? getSubject(session.subject) : null
  const subjectLabel = session.subject === 'other' ? (session.subject_custom_label || 'Other') : subjectInfo?.label

  return (
    <a
      href={`/transcript/${session.id}`}
      className="flex items-center gap-4 rounded-2xl px-5 py-4 transition group"
      style={{
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-xs)',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-xs)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
    >
      <PersonaAvatar personaId={session.persona} size={32} />

      {/* Title + date */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-strong)' }}>{label}</p>
        <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          {subjectInfo && (
            <>
              <SubjectIcon value={session.subject} size={12} style={{ color: 'var(--text-muted)' }} />
              <span>{subjectLabel}</span>
              <span style={{ color: 'var(--border-strong)' }}>·</span>
            </>
          )}
          {formatDate(session.updated_at ?? session.created_at)}
        </p>
      </div>

      {/* Status badge */}
      <span
        className="shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1"
        style={isDone
          ? { backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }
          : { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }
        }
      >
        {isDone ? '✓ Done' : 'In progress'}
      </span>

      {/* Arrow */}
      <span className="shrink-0 text-sm transition-transform group-hover:translate-x-0.5"
        style={{ color: 'var(--text-subtle)' }}>→</span>
    </a>
  )
}


// ── No children linked ────────────────────────────────────────
function EmptyState() {
  return (
    <div className="rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-4"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
      <span className="text-4xl">👪</span>
      <div className="space-y-1">
        <p className="font-semibold text-lg" style={{ color: 'var(--text-strong)' }}>No students linked yet</p>
        <p className="text-sm max-w-sm" style={{ color: 'var(--text-muted)' }}>
          Ask your child to log into BrainScribe and invite you from their dashboard.
          You'll get an email with a link — click it and you're connected.
        </p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
export default function ParentDashboard({ user, profile, children, sessions, ownSessions = [] }) {
  const [selectedChildId, setSelectedChildId] = useState(children[0]?.id ?? null)
  const [activeTab, setActiveTab] = useState('assignments')

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const selectedChild = children.find(c => c.id === selectedChildId)
  const childSessions = sessions.filter(s => s.student_id === selectedChildId)
    .sort((a, b) => new Date(b.updated_at ?? b.created_at) - new Date(a.updated_at ?? a.created_at))

  // Most recent session that has a writing profile (for the Writing Profile tab)
  const latestProfileSession = childSessions.find(s => s.writing_profile)
  const latestCompletedSession = childSessions.find(s => s.status === 'complete')

  const tabStyle = (tab) => ({
    fontSize: '0.8125rem',
    fontWeight: 600,
    padding: '6px 16px',
    borderRadius: '999px',
    transition: 'all 150ms',
    backgroundColor: activeTab === tab ? 'var(--primary)' : 'transparent',
    color: activeTab === tab ? 'white' : 'var(--text-muted)',
    border: 'none',
    cursor: 'pointer',
  })

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>

      <Navbar user={user} profile={profile} />

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>
            Hey, {firstName}! 👋
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {children.length === 0
              ? 'Connect with your child to see their progress.'
              : children.length === 1
                ? `Following ${children[0].full_name?.split(' ')[0] ?? 'your student'}'s writing.`
                : `Following ${children.length} students.`}
          </p>
        </div>

        {/* Your own writing — parents can use the coaches too */}
        <YourWritingCard ownSessions={ownSessions} />

        {/* No children */}
        {children.length === 0 && <EmptyState />}

        {/* Children + content */}
        {children.length > 0 && (
          <div className="space-y-5">

            {/* Child selector — only show if more than one child */}
            {children.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {children.map(child => (
                  <ChildChip
                    key={child.id}
                    child={child}
                    selected={selectedChildId === child.id}
                    onClick={() => setSelectedChildId(child.id)}
                  />
                ))}
              </div>
            )}

            {/* Child card */}
            {selectedChild && (
              <div className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>

                {/* Child header */}
                <div className="px-5 py-4 flex items-center gap-4"
                  style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-page-alt)' }}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
                    style={{ backgroundColor: 'var(--primary)' }}>
                    {initials(selectedChild.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold" style={{ color: 'var(--text-strong)' }}>{selectedChild.full_name ?? 'Student'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {childSessions.length} assignment{childSessions.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 rounded-full p-1" style={{ backgroundColor: 'var(--surface-muted)' }}>
                    <button style={tabStyle('assignments')} onClick={() => setActiveTab('assignments')}>
                      Assignments
                    </button>
                    <button style={tabStyle('profile')} onClick={() => setActiveTab('profile')}>
                      Writing Profile
                    </button>
                  </div>
                </div>

                {/* Tab content */}
                <div className="p-5">
                  {activeTab === 'assignments' && (
                    <div className="space-y-3">
                      {childSessions.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-sm italic" style={{ color: 'var(--text-subtle)' }}>
                            No assignments yet — they'll appear here once{' '}
                            {selectedChild.full_name?.split(' ')[0] ?? 'your student'} starts writing.
                          </p>
                        </div>
                      ) : (
                        childSessions.map(session => (
                          <AssignmentCard key={session.id} session={session} />
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'profile' && (
                    <WritingProfileCard
                      profile={latestProfileSession?.writing_profile ?? null}
                      sessionComplete={!!latestCompletedSession}
                      studentName={selectedChild.full_name?.split(' ')[0]}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
