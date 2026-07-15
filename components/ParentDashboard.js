'use client'

import YourWritingCard from '@/components/YourWritingCard'
import PendingInviteBanner from '@/components/PendingInviteBanner'
import Avatar from '@/components/Avatar'
import AssignmentTeachers from '@/components/AssignmentTeachers'
import Navbar from '@/components/Navbar'
import { PersonaAvatar } from '@/lib/personas'
import { getSubject } from '@/lib/subjects'
import SubjectIcon from '@/components/SubjectIcon'
import Icon from '@/components/Icon'


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
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)' }}
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


// ── No children linked ────────────────────────────────────────
function EmptyState() {
  return (
    <div className="rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-4"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
      <Icon name="users" size={36} style={{ color: 'var(--text-subtle)' }} />
      <div className="space-y-1">
        <p className="font-semibold text-lg" style={{ color: 'var(--text-strong)' }}>No students linked yet</p>
        <p className="text-sm max-w-sm" style={{ color: 'var(--text-muted)' }}>
          Invite your child from <span className="font-semibold">Account &amp; children</span>,
          or ask them to invite you from their own dashboard. Either way, once they sign in
          you'll be connected.
        </p>
      </div>
      <a href="/parent/settings"
        className="text-sm font-semibold rounded-full px-4 py-2 text-white transition"
        style={{ backgroundColor: 'var(--accent)' }}>
        Add a child →
      </a>
    </div>
  )
}

// ── Per-child block ───────────────────────────────────────────
function ChildBlock({ child, sessions, teachersBySession = {} }) {
  const childSessions = sessions
    .filter(s => s.student_id === child.id)
    .sort((a, b) => new Date(b.updated_at ?? b.created_at) - new Date(a.updated_at ?? a.created_at))
  const firstName = child.full_name?.split(' ')[0] ?? 'your student'

  return (
    <section className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>

      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-4"
        style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-page-alt)' }}>
        <Avatar
          name={child.full_name}
          avatarUrl={child.avatar_url}
          ageBracket={child.age_bracket}
          size={44}
        />
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate" style={{ color: 'var(--text-strong)' }}>{child.full_name ?? 'Student'}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {childSessions.length} assignment{childSessions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <a href={`/profile/${child.id}`}
          className="shrink-0 text-xs font-semibold rounded-full px-3 py-1.5 transition"
          style={{ border: '1px solid var(--border-strong)', color: 'var(--text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
          View profile →
        </a>
      </div>

      {/* Assignments */}
      <div className="p-5 space-y-3">
        {childSessions.length === 0 ? (
          <p className="text-sm italic text-center py-6" style={{ color: 'var(--text-subtle)' }}>
            No assignments yet — they'll appear here once {firstName} starts writing.
          </p>
        ) : (
          childSessions.map(s => (
            <div key={s.id} className="space-y-2">
              <AssignmentCard session={s} />
              <AssignmentTeachers sessionId={s.id} teachers={teachersBySession[s.id] ?? []} />
            </div>
          ))
        )}
      </div>
    </section>
  )
}

// ── Main component ────────────────────────────────────────────
export default function ParentDashboard({ user, profile, children, sessions, teachersBySession = {}, ownSessions = [], pendingInvites = [] }) {
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>

      <Navbar user={user} profile={profile} />

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        <PendingInviteBanner invites={pendingInvites} />

        {/* Greeting. (The old top-right "Account & children" button is gone — the
            Navbar avatar now links straight to /parent/settings, and adding a
            child lives at the bottom of the page.) */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>
            Hey, {firstName}!
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

        {/* One block per child — all expanded (parents have few kids) */}
        {children.map(child => (
          <ChildBlock key={child.id} child={child} sessions={sessions}
            teachersBySession={teachersBySession} />
        ))}

        {/* Add-child affordance stays at the bottom. When there are 0 children the
            EmptyState above already carries it; once they have at least one, offer
            "Add another child" here. */}
        {children.length > 0 && (
          <div className="flex justify-center pt-1">
            <a href="/parent/settings"
              className="text-sm font-semibold rounded-full px-4 py-2 transition"
              style={{ border: '1px solid var(--border-strong)', color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
              + Add another child
            </a>
          </div>
        )}

      </main>
    </div>
  )
}
