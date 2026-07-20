'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSubject } from '@/lib/subjects'
import SubjectIcon from '@/components/SubjectIcon'
import { chipState } from '@/lib/requirements'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now - date) / 86400000)
  if (diffDays === 0) return 'Today, ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ClientDate({ dateStr }) {
  const [label, setLabel] = useState('')
  useEffect(() => { setLabel(formatDate(dateStr)) }, [dateStr])
  return <span suppressHydrationWarning>{label}</span>
}

// "Last modified" label: WEEKDAY + time within the last week (e.g. "WED, 9:00 pm"),
// switching to the actual date once it's older than a week (e.g. "Jul 10, 9:00 pm").
function formatLastModified(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const diffDays = Math.floor((new Date() - date) / 86400000)
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  if (diffDays < 7) return `${date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}, ${time}`
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

// Client-computed (locale/timezone dependent) so it can't cause a hydration mismatch.
function ClientLastModified({ dateStr }) {
  const [label, setLabel] = useState('')
  useEffect(() => { setLabel(formatLastModified(dateStr)) }, [dateStr])
  return <span suppressHydrationWarning>{label}</span>
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function GoogleBadge() {
  return (
    <span title="Signed in with Google" style={{ position: 'absolute', right: -3, bottom: -3, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-xs)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="9" height="9" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    </span>
  )
}

function TeacherAvatar({ name }) {
  return (
    <span className="shrink-0" style={{ width: 28, height: 28, borderRadius: 'var(--radius-pill)', background: 'var(--navy-100)', color: 'var(--navy-700)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: 'var(--type-meta)', fontWeight: 'var(--fw-bold)' }}>
      {initials(name)}
    </span>
  )
}

function MenuItem({ label, color = 'var(--text-body)', icon, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full text-left flex items-center gap-2.5 transition"
      style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-semibold)', color, background: 'none', border: 'none', cursor: 'pointer', padding: '9px 14px', borderRadius: 'var(--radius-sm)' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
      {icon}{label}
    </button>
  )
}

function AssignmentRow({ session, teachers, canManage, canInvite = canManage, watcherHref = '/transcript', onDeleted, onRenamed }) {
  const router = useRouter()
  const [menu, setMenu] = useState(false)
  const [picking, setPicking] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(session.title ?? '')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteState, setInviteState] = useState('idle') // idle | sending | sent
  const renameRef = useRef(null)

  useEffect(() => { if (renaming) renameRef.current?.focus() }, [renaming])

  // Keyboard-dismiss the menu / teacher popover with Escape.
  useEffect(() => {
    if (!menu && !picking) return
    const onKey = e => { if (e.key === 'Escape') { setMenu(false); setPicking(false) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menu, picking])

  const teacher = teachers?.[0] ?? null
  const done = session.status === 'complete'
  const statusColor = done ? 'var(--status-success)' : 'var(--navy-500)'
  const statusLabel = done ? 'Complete' : 'In progress'
  const displayTitle = session.title || session.assignment_text?.slice(0, 90) + (session.assignment_text?.length > 90 ? '…' : '')
  const subjectInfo = session.subject && session.subject !== 'unspecified' ? getSubject(session.subject) : null
  const subjectLabel = session.subject === 'other' ? (session.subject_custom_label || 'Other') : subjectInfo?.label
  const hasTargets = session.requirements?.targets?.length > 0
  // "Last modified" = when the work actually last changed: completion time for done
  // items, genuine last-activity (last_active_at) for in-progress ones.
  const lastModifiedDate = (done && session.completed_at) ? session.completed_at : (session.last_active_at ?? session.updated_at ?? session.created_at)

  function close() { setMenu(false); setPicking(false) }
  // The writer (canManage) opens the active-writing view for in-progress work and
  // the read-only transcript for completed work. A WATCHER (!canManage) never
  // enters the writing view; it lands on `watcherHref/<id>` — parents on the
  // transcript (default), teachers on their tailored /assignment read-only view.
  function open() {
    const writing = canManage && session.status !== 'complete'
    router.push(writing ? `/assignment/${session.id}` : `${watcherHref}/${session.id}`)
  }

  async function saveRename() {
    const t = draft.trim()
    setRenaming(false)
    if (!t) return
    onRenamed(session.id, t)
    await fetch(`/api/sessions/${session.id}/title`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t }) })
  }
  async function handleDelete() {
    close()
    onDeleted(session.id)                                        // optimistic local removal
    await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' })
    // Invalidate the App Router cache so the deletion sticks across navigation.
    // Without this the folder re-renders from the client cache on back-nav and the
    // deleted row reappears until a hard refresh (it was already gone server-side).
    router.refresh()
  }
  async function sendInvite() {
    const email = inviteEmail.trim()
    if (!email || !email.includes('@')) return
    setInviteState('sending')
    try {
      await fetch('/api/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role: 'teacher', assignmentId: session.id }) })
      setInviteState('sent')
    } catch { setInviteState('idle') }
  }

  return (
    <div style={{
      backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)',
      borderRadius: 'var(--radius-md)', padding: 'var(--space-4) var(--space-5)', position: 'relative',
    }}>
      {renaming ? (
        <div className="flex items-center gap-2" style={{ paddingRight: 40 }}>
          <input ref={renameRef} value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false) }}
            onBlur={saveRename}
            style={{ flex: 1, font: 'var(--type-body)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--ring)', outline: 'none' }} />
          <button onClick={saveRename} aria-label="Save name" style={{ display: 'flex', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: 7, cursor: 'pointer' }} title="Save">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </button>
        </div>
      ) : (
        <>
          {/* Title (up to 2 lines) + meta. Right padding clears the top-right menu;
              bottom padding reserves the bottom-right status corner. */}
          <div style={{ paddingRight: 40, paddingBottom: 22 }}>
            <button onClick={open} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              <p style={{ font: 'var(--type-body)', fontWeight: 'var(--fw-bold)', color: 'var(--text-strong)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 'var(--leading-snug)' }}>{displayTitle}</p>
            </button>
            <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: '4px 0 0' }}>
              Last modified: <ClientLastModified dateStr={lastModifiedDate} />
            </p>
            {(subjectLabel || hasTargets) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: '3px 0 0' }}>
                {subjectLabel && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <SubjectIcon value={session.subject} size={12} style={{ color: 'var(--text-subtle)' }} />{subjectLabel}
                  </span>
                )}
                {subjectLabel && hasTargets && <span aria-hidden="true" style={{ color: 'var(--border-strong)' }}>·</span>}
                {hasTargets && (
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {session.requirements.targets.map(t => chipState(t, session.requirements.actual)?.full).filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Overflow menu — top-right (Rename / Assign teacher / Open / Delete). */}
          {canManage && (
            <button onClick={() => { setMenu(m => !m); setPicking(false) }} aria-label="More actions" aria-haspopup="menu" aria-expanded={menu}
              style={{ position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 'var(--radius-pill)', border: 'none', background: menu ? 'var(--surface-muted)' : 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
              </span>
            </button>
          )}

          {/* Status — bottom-right corner. */}
          <span style={{ position: 'absolute', right: 'var(--space-5)', bottom: 'var(--space-4)', display: 'inline-flex', alignItems: 'center', gap: 5, font: 'var(--type-meta)', fontWeight: 'var(--fw-semibold)', color: done ? 'var(--status-success)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />{statusLabel}
          </span>
        </>
      )}

      {(menu || picking) && <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}

      {menu && (
        <div style={{ position: 'absolute', top: 56, right: 16, zIndex: 50, width: 188, background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)', padding: 6 }}>
          <MenuItem label="Rename" icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 2.5l2 2-9 9H2.5v-2l9-9z" strokeLinejoin="round"/></svg>} onClick={() => { setDraft(session.title ?? ''); setRenaming(true); close() }} />
          <MenuItem label={teacher ? 'Change teacher' : 'Assign teacher'} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>} onClick={() => { setMenu(false); setPicking(true) }} />
          <MenuItem label="Open" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>} onClick={() => { close(); open() }} />
          <div style={{ height: 1, background: 'var(--border-default)', margin: '6px 8px' }} />
          <MenuItem label="Delete" color="var(--status-error)" icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" strokeLinejoin="round" strokeLinecap="round"/></svg>} onClick={handleDelete} />
        </div>
      )}

      {picking && (
        <div style={{ position: 'absolute', top: 56, right: 16, zIndex: 50, width: 248, background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)', padding: 12 }}>
          <p style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', margin: '0 0 8px' }}>Teacher for this assignment</p>
          {teacher && (
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <TeacherAvatar name={teacher.name} />
              <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-strong)' }}>{teacher.name}</span>
            </div>
          )}
          {inviteState === 'sent' ? (
            <p style={{ font: 'var(--type-meta)', color: 'var(--status-success)', margin: 0 }}>Invite sent — they&apos;ll get a link to view this assignment.</p>
          ) : (
            <>
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="teacher@school.edu" type="email"
                onKeyDown={e => { if (e.key === 'Enter') sendInvite() }}
                style={{ width: '100%', font: 'var(--type-ui)', color: 'var(--text-strong)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
              <button onClick={sendInvite} disabled={inviteState === 'sending' || !inviteEmail.includes('@')}
                className="w-full transition disabled:opacity-50"
                style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-bold)', color: 'var(--text-on-accent)', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 10px', cursor: 'pointer' }}>
                {inviteState === 'sending' ? 'Sending…' : teacher ? 'Invite another teacher' : 'Send invite'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Beta: the free-session limit is disabled (no paid plans yet). The meter markup
// is kept behind this flag so it can be switched on when plans land.
const SHOW_USAGE_METER = false

export default function SessionsList({ sessions: initial, teachersBySession = {}, canManage = true, canInvite = canManage, watcherHref = '/transcript' }) {
  const [sessions, setSessions] = useState(initial)
  // Three tabs. Default to "In progress" when there's active work, else "Done" — so
  // the default view is never empty (e.g. a parent viewing a child whose assignments
  // are all complete lands on Done).
  const [filter, setFilter] = useState(() => initial.some(s => s.status !== 'complete') ? 'active' : 'complete')

  const visible = sessions.filter(s =>
    filter === 'all' ? true : filter === 'complete' ? s.status === 'complete' : s.status !== 'complete'
  )
  const filters = [['active', 'In progress'], ['complete', 'Done'], ['all', 'All']]

  return (
    <section>
      {/* Free-sessions usage meter — DISABLED for Beta (flag off). Spec retained. */}
      {SHOW_USAGE_METER && (
        <div style={{ backgroundColor: 'var(--surface-muted)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4) var(--space-5)', marginBottom: 'var(--space-6)', display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
          <div style={{ flexShrink: 0 }}>
            <p style={{ font: 'var(--type-meta)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--text-muted)', margin: '0 0 3px' }}>Free sessions</p>
            <p style={{ font: 'var(--type-subhead)', color: 'var(--text-strong)', margin: 0 }}><span style={{ color: 'var(--accent)', fontWeight: 'var(--fw-bold)' }}>2</span> of 5 left</p>
          </div>
          <div style={{ flex: 1, minWidth: 40 }}>
            <div style={{ height: 8, borderRadius: 'var(--radius-pill)', background: 'var(--surface-sunken)', overflow: 'hidden' }}>
              <div style={{ width: '60%', height: '100%', borderRadius: 'var(--radius-pill)', background: 'var(--accent)' }} />
            </div>
          </div>
          <button style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-link)', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-pill)', padding: '7px 14px', cursor: 'pointer' }}>Ask a parent to upgrade →</button>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2" style={{ marginBottom: 'var(--space-5)' }}>
        {filters.map(([key, label]) => {
          const on = filter === key
          return (
            <button key={key} onClick={() => setFilter(key)}
              style={{
                font: 'var(--type-ui)', fontWeight: 'var(--fw-semibold)', cursor: 'pointer', padding: '7px 16px', borderRadius: 'var(--radius-pill)',
                background: on ? 'var(--primary)' : 'var(--surface-card)', color: on ? 'var(--text-on-dark)' : 'var(--text-muted)',
                border: `1px solid ${on ? 'var(--primary)' : 'var(--border-default)'}`,
              }}>
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
        {visible.map(s => (
          <AssignmentRow
            key={s.id}
            session={s}
            teachers={teachersBySession[s.id]}
            canManage={canManage}
            canInvite={canInvite}
            watcherHref={watcherHref}
            onDeleted={id => setSessions(prev => prev.filter(x => x.id !== id))}
            onRenamed={(id, title) => setSessions(prev => prev.map(x => x.id === id ? { ...x, title } : x))}
          />
        ))}
        {visible.length === 0 && (
          <div style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 'var(--space-7)', textAlign: 'center' }}>
            <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', margin: 0 }}>Nothing here yet.</p>
          </div>
        )}
      </div>
    </section>
  )
}
