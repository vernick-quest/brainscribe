'use client'

import YourWritingCard from '@/components/YourWritingCard'
import PendingInviteBanner from '@/components/PendingInviteBanner'
import Avatar from '@/components/Avatar'
import Navbar from '@/components/Navbar'
import SessionsList from '@/components/SessionsList'
import Icon from '@/components/Icon'


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

      {/* Assignments — SAME list UI the student sees (SessionsList), read-only
          because a parent is a watcher (canManage=false → no rename/delete/assign,
          links land on the transcript). */}
      <div className="p-5">
        {childSessions.length === 0 ? (
          <p className="text-sm italic text-center py-6" style={{ color: 'var(--text-subtle)' }}>
            No assignments yet — they'll appear here once {firstName} starts writing.
          </p>
        ) : (
          <SessionsList sessions={childSessions} teachersBySession={teachersBySession} canManage={false} />
        )}
      </div>
    </section>
  )
}

// ── Main component ────────────────────────────────────────────
export default function ParentDashboard({ user, profile, children, sessions, teachersBySession = {}, ownSessions = [], pendingInvites = [], impersonating = false }) {
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>

      <Navbar user={user} profile={profile} />

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        <PendingInviteBanner invites={pendingInvites} readOnly={impersonating} />

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
        <YourWritingCard ownSessions={ownSessions} impersonating={impersonating} />

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
