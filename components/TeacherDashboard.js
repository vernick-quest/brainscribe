'use client'

import { useState, useRef, useEffect } from 'react'
import Navbar from '@/components/Navbar'
import { getPersona, PersonaAvatar } from '@/lib/personas'
import { getSubject } from '@/lib/subjects'
import SubjectIcon from '@/components/SubjectIcon'


function formatDate(str) {
  if (!str) return ''
  const d = new Date(str)
  const now = new Date()
  const days = Math.floor((now - d) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// ── Student chip ──────────────────────────────────────────────
function StudentChip({ student, count, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-2xl px-4 py-2.5 transition font-medium text-sm"
      style={{
        backgroundColor: selected ? 'var(--primary)' : 'var(--surface-card)',
        color: selected ? 'white' : 'var(--text-strong)',
        border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border-default)'}`,
        boxShadow: selected ? 'var(--shadow-sm)' : 'none',
      }}
    >
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{
          backgroundColor: selected ? 'rgba(255,255,255,0.18)' : 'var(--primary-soft)',
          color: selected ? 'white' : 'var(--primary)',
        }}
      >
        {initials(student.full_name)}
      </span>
      {student.full_name?.split(' ')[0] ?? student.email}
      <span
        className="text-xs rounded-full px-1.5 py-0.5 font-semibold ml-0.5"
        style={{
          backgroundColor: selected ? 'rgba(255,255,255,0.2)' : 'var(--surface-muted)',
          color: selected ? 'white' : 'var(--text-muted)',
        }}
      >
        {count}
      </span>
    </button>
  )
}

// ── Assignment row ────────────────────────────────────────────
function AssignmentRow({ session }) {
  const isDone = session.status === 'complete'
  const label = session.title || session.assignment_text?.slice(0, 72) + (session.assignment_text?.length > 72 ? '…' : '')
  const subjectInfo = session.subject && session.subject !== 'unspecified' ? getSubject(session.subject) : null
  const subjectLabel = session.subject === 'other' ? (session.subject_custom_label || 'Other') : subjectInfo?.label

  return (
    <a
      href={`/assignment/${session.id}`}
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

      <span
        className="shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1"
        style={isDone
          ? { backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }
          : { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }
        }
      >
        {isDone ? '✓ Done' : 'In progress'}
      </span>

      <span className="shrink-0 text-sm transition-transform group-hover:translate-x-0.5"
        style={{ color: 'var(--text-subtle)' }}>→</span>
    </a>
  )
}

// ── Notification bell + panel ─────────────────────────────────
function timeAgo(str) {
  const d = new Date(str)
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function NotificationBell({ notifications }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(notifications)
  const ref = useRef(null)

  const unread = items.filter(n => !n.read).length

  // Close on outside click
  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  async function openPanel() {
    setOpen(o => !o)
    if (!open && unread > 0) {
      // Optimistically mark all as read
      setItems(prev => prev.map(n => ({ ...n, read: true })))
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={openPanel}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl transition"
        style={{
          backgroundColor: open ? 'var(--surface-muted)' : 'transparent',
          color: 'var(--text-muted)',
          border: '1px solid transparent',
        }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-muted)'}
        onMouseLeave={e => { if (!open) e.currentTarget.style.backgroundColor = 'transparent' }}
        title="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white rounded-full"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 z-50 rounded-2xl overflow-hidden"
          style={{
            width: 320,
            backgroundColor: 'var(--surface-card)',
            border: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border-default)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Notifications</p>
            {items.length > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>{items.length} total</span>
            )}
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm italic" style={{ color: 'var(--text-subtle)' }}>No notifications yet.</p>
              </div>
            ) : (
              items.map(n => (
                <a
                  key={n.id}
                  href={n.session_id ? `/assignment/${n.session_id}` : '#'}
                  className="flex gap-3 px-4 py-3 transition"
                  style={{
                    borderBottom: '1px solid var(--border-default)',
                    backgroundColor: 'transparent',
                    display: 'flex',
                    alignItems: 'flex-start',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-muted)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span className="text-base shrink-0 mt-0.5">
                    {n.type === 'assignment_complete' ? '✓' : '📋'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug" style={{ color: 'var(--text-body)' }}>{n.message}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>{timeAgo(n.created_at)}</p>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="rounded-2xl p-10 flex flex-col items-center text-center space-y-3"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
      <span className="text-4xl">📋</span>
      <div className="space-y-1">
        <p className="font-semibold text-lg" style={{ color: 'var(--text-strong)' }}>No assignments yet</p>
        <p className="text-sm max-w-sm" style={{ color: 'var(--text-muted)' }}>
          When a student invites you to an assignment, it will appear here.
          Share your email with students so they can add you.
        </p>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function TeacherDashboard({ user, profile, students, sessions, notifications = [] }) {
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id ?? null)

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  const studentSessions = sessions.filter(s => s.student_id === selectedStudentId)
    .sort((a, b) => new Date(b.updated_at ?? b.created_at) - new Date(a.updated_at ?? a.created_at))

  const sessionCountByStudent = Object.fromEntries(
    students.map(st => [st.id, sessions.filter(s => s.student_id === st.id).length])
  )

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
            {students.length === 0
              ? 'No students linked yet.'
              : students.length === 1
                ? `Reviewing ${students[0].full_name?.split(' ')[0] ?? 'a student'}'s work.`
                : `Reviewing work from ${students.length} students.`}
          </p>
        </div>

        {/* No students */}
        {students.length === 0 && <EmptyState />}

        {/* Students + assignments */}
        {students.length > 0 && (
          <div className="space-y-5">

            {/* Student selector */}
            {students.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {students.map(st => (
                  <StudentChip
                    key={st.id}
                    student={st}
                    count={sessionCountByStudent[st.id] ?? 0}
                    selected={selectedStudentId === st.id}
                    onClick={() => setSelectedStudentId(st.id)}
                  />
                ))}
              </div>
            )}

            {/* Student card */}
            {selectedStudentId && (() => {
              const student = students.find(s => s.id === selectedStudentId)
              return (
                <div className="rounded-2xl overflow-hidden"
                  style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>

                  {/* Student header */}
                  <div className="px-5 py-4 flex items-center gap-4"
                    style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-page-alt)' }}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
                      style={{ backgroundColor: 'var(--primary)' }}>
                      {initials(student?.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold" style={{ color: 'var(--text-strong)' }}>
                        {student?.full_name ?? 'Student'}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {studentSessions.length} assignment{studentSessions.length !== 1 ? 's' : ''} shared with you
                      </p>
                    </div>
                  </div>

                  {/* Assignments */}
                  <div className="p-5 space-y-3">
                    {studentSessions.length === 0 ? (
                      <p className="text-sm italic text-center py-6" style={{ color: 'var(--text-subtle)' }}>
                        No assignments yet.
                      </p>
                    ) : (
                      studentSessions.map(session => (
                        <AssignmentRow key={session.id} session={session} />
                      ))
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </main>
    </div>
  )
}
