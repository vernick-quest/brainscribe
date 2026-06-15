'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'

const PERSONA_EMOJI = { deon: '🎯', zoe: '✨', alistair: '🎩', matilda: '🌿', owen: '☀️', jade: '⚡' }
const ROLE_COLOR = {
  student: { bg: 'var(--accent-soft)', text: 'var(--accent)' },
  parent:  { bg: 'var(--status-success-bg)', text: 'var(--status-success)' },
  teacher: { bg: '#EEF2FF', text: '#4338CA' },
  admin:   { bg: '#FEF3C7', text: '#92400E' },
}

function formatDate(str) {
  if (!str) return '—'
  const d = new Date(str)
  const now = new Date()
  const diffMin = Math.floor((now - d) / 60000)
  if (diffMin < 60)  return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)    return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7)     return `${diffD}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function RoleBadge({ role }) {
  const c = ROLE_COLOR[role] ?? ROLE_COLOR.student
  return (
    <span className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5"
      style={{ backgroundColor: c.bg, color: c.text }}>
      {role}
    </span>
  )
}

function StatusBadge({ status }) {
  const done = status === 'complete'
  return (
    <span className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5"
      style={done
        ? { backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }
        : { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
      {done ? '✓ done' : 'active'}
    </span>
  )
}

// ── Role editor dropdown ───────────────────────────────────────
const ALL_ROLES = ['student', 'parent', 'teacher', 'admin']

function RoleEditor({ userId, currentRole, onChanged }) {
  const [role, setRole] = useState(currentRole)
  const [saving, setSaving] = useState(false)

  async function handleChange(e) {
    const newRole = e.target.value
    if (newRole === role) return
    setSaving(true)
    const res = await fetch('/api/admin/set-role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: newRole }),
    })
    if (res.ok) {
      setRole(newRole)
      onChanged?.(newRole)
    }
    setSaving(false)
  }

  const c = ROLE_COLOR[role] ?? ROLE_COLOR.student
  return (
    <div className="relative">
      <select
        value={role}
        onChange={handleChange}
        disabled={saving}
        className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 pr-5 appearance-none cursor-pointer border-0 outline-none"
        style={{ backgroundColor: c.bg, color: c.text }}
      >
        {ALL_ROLES.map(r => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px]"
        style={{ color: c.text }}>▾</span>
    </div>
  )
}

// ── Remote-in button ──────────────────────────────────────────
function RemoteInButton({ userId, role, name }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const res = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role, name }),
    })
    const { dest } = await res.json()
    window.location.href = dest
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition shrink-0"
      style={{
        backgroundColor: 'var(--surface-muted)',
        color: 'var(--text-muted)',
        border: '1px solid var(--border-default)',
      }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--primary)'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'var(--primary)' }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--surface-muted)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
    >
      {loading ? '…' : '👁 Remote in'}
    </button>
  )
}

// ── Onboarding flag ───────────────────────────────────────────
// At-a-glance: green = completed onboarding, grey = will be sent through it.
// Click to toggle — resetting to "Not onboarded" routes them through onboarding
// on their next sign-in (handy for testing).
function OnboardingBadge({ userId, complete }) {
  const [done, setDone] = useState(complete)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    const next = !done
    setSaving(true)
    const res = await fetch('/api/admin/set-onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, complete: next }),
    })
    if (res.ok) setDone(next)
    setSaving(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={done
        ? 'Onboarded — click to reset (they’ll go through onboarding again next sign-in)'
        : 'Not onboarded — click to mark complete'}
      className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 transition shrink-0 cursor-pointer"
      style={done
        ? { backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }
        : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-subtle)', border: '1px solid var(--border-default)' }}
    >
      {saving ? '…' : done ? 'Onboarded ✓' : 'Not onboarded'}
    </button>
  )
}

// ── Tab bar ────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 rounded-full p-1 w-fit"
      style={{ backgroundColor: 'var(--surface-muted)' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className="text-xs font-semibold px-4 py-1.5 rounded-full transition"
          style={{
            backgroundColor: active === t.id ? 'var(--surface-card)' : 'transparent',
            color: active === t.id ? 'var(--text-strong)' : 'var(--text-muted)',
            boxShadow: active === t.id ? 'var(--shadow-xs)' : 'none',
          }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Session row ────────────────────────────────────────────────
function SessionRow({ session, studentName, compact = false }) {
  const label = session.title || session.assignment_text?.slice(0, 60) + (session.assignment_text?.length > 60 ? '…' : '')
  return (
    <a href={`/assignment/${session.id}`}
      className="flex items-center gap-3 rounded-xl px-4 py-3 transition group"
      style={{
        border: '1px solid var(--border-default)',
        backgroundColor: 'var(--surface-card)',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.backgroundColor = 'var(--surface-spark)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.backgroundColor = 'var(--surface-card)' }}>

      <span className="text-base shrink-0">{PERSONA_EMOJI[session.persona] ?? '✏️'}</span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-strong)' }}>{label}</p>
        {!compact && studentName && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{studentName}</p>
        )}
      </div>

      <StatusBadge status={session.status} />

      <span className="text-xs shrink-0" style={{ color: 'var(--text-subtle)' }}>
        {formatDate(session.updated_at ?? session.created_at)}
      </span>

      <span className="text-xs opacity-0 group-hover:opacity-100 transition shrink-0"
        style={{ color: 'var(--accent)' }}>→</span>
    </a>
  )
}

// ── Student card (expandable) ─────────────────────────────────
function StudentCard({ student, sessions, onRoleChanged }) {
  const [open, setOpen] = useState(false)
  const completedCount = sessions.filter(s => s.status === 'complete').length

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-xs)' }}>

      <div className="flex items-center gap-3 px-5 py-4">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ backgroundColor: 'var(--primary)' }}>
          {initials(student.full_name)}
        </div>

        {/* Name + email — clickable to expand */}
        <button className="flex-1 min-w-0 text-left" onClick={() => setOpen(o => !o)}>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
            {student.full_name ?? '—'}
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{student.email}</p>
        </button>

        {/* Stats + controls */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
          {completedCount > 0 && (
            <span className="text-xs font-semibold rounded-full px-2 py-0.5"
              style={{ backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
              {completedCount} ✓
            </span>
          )}
          <OnboardingBadge userId={student.id} complete={student.onboarding_complete === true} />
          <RoleEditor userId={student.id} currentRole={student.role} onChanged={onRoleChanged} />
          <RemoteInButton userId={student.id} role={student.role} name={student.full_name} />
          <button onClick={() => setOpen(o => !o)}
            className="text-xs transition-transform"
            style={{ color: 'var(--text-subtle)', transform: open ? 'rotate(90deg)' : 'none' }}>▶</button>
        </div>
      </div>

      {open && (
        <div className="px-5 pb-4 pt-1 space-y-2"
          style={{ borderTop: '1px solid var(--border-default)' }}>
          {sessions.length === 0 ? (
            <p className="text-sm italic py-4 text-center" style={{ color: 'var(--text-subtle)' }}>No sessions yet</p>
          ) : (
            sessions.map(s => <SessionRow key={s.id} session={s} compact />)
          )}
        </div>
      )}
    </div>
  )
}

// ── Person row (parents + teachers) ──────────────────────────
function PersonRow({ person, meta, showControls = false, onRoleChanged }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3"
      style={{ backgroundColor: 'var(--surface-card)' }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ backgroundColor: 'var(--primary)' }}>
        {initials(person.full_name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-strong)' }}>
          {person.full_name ?? '—'}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{person.email}</p>
      </div>
      {meta && <p className="text-xs shrink-0" style={{ color: 'var(--text-subtle)' }}>{meta}</p>}
      <span className="text-xs shrink-0" style={{ color: 'var(--text-subtle)' }}>
        {formatDate(person.created_at)}
      </span>
      {showControls && (
        <>
          <RoleEditor userId={person.id} currentRole={person.role} onChanged={onRoleChanged} />
          <RemoteInButton userId={person.id} role={person.role} name={person.full_name} />
        </>
      )}
    </div>
  )
}

// ── Search bar ─────────────────────────────────────────────────
function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-subtle)' }}>🔍</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm rounded-xl pl-9 pr-4 py-2 outline-none"
        style={{
          backgroundColor: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-strong)',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
        onBlur={e => e.target.style.borderColor = 'var(--border-default)'}
      />
    </div>
  )
}

// ── Usage tab ─────────────────────────────────────────────────
function UsageTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/admin/usage')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return (
    <p className="text-sm italic text-center py-12" style={{ color: 'var(--text-subtle)' }}>Loading usage data…</p>
  )
  if (error) return (
    <p className="text-sm text-center py-12" style={{ color: 'var(--status-error, #dc2626)' }}>Failed to load: {error}</p>
  )

  const { anthropic, elevenlabs, byUser } = data ?? {}

  // ElevenLabs: characters remaining
  const elPct = elevenlabs ? Math.min(100, (elevenlabs.characterCount / elevenlabs.characterLimit) * 100) : 0
  const elRemaining = elevenlabs ? elevenlabs.characterLimit - elevenlabs.characterCount : 0
  const elResetDate = elevenlabs?.resetUnix
    ? new Date(elevenlabs.resetUnix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null
  const elDanger = elPct > 80

  return (
    <div className="space-y-6">

      {/* ElevenLabs */}
      <div className="rounded-2xl p-5 space-y-4"
        style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>ElevenLabs — Characters</p>
            {elevenlabs?.tier && (
              <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--text-muted)' }}>{elevenlabs.tier} plan</p>
            )}
          </div>
          {elResetDate && (
            <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Resets {elResetDate}</p>
          )}
        </div>

        {elevenlabs ? (
          <>
            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-muted)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${elPct}%`,
                    backgroundColor: elDanger ? '#dc2626' : elPct > 60 ? '#f59e0b' : 'var(--status-success)',
                  }}
                />
              </div>
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>{elevenlabs.characterCount.toLocaleString()} used</span>
                <span style={{ color: elDanger ? '#dc2626' : undefined, fontWeight: elDanger ? 700 : undefined }}>
                  {elRemaining.toLocaleString()} remaining of {elevenlabs.characterLimit.toLocaleString()}
                </span>
              </div>
            </div>
            {elDanger && (
              <p className="text-xs font-semibold rounded-lg px-3 py-2"
                style={{ backgroundColor: '#FEF2F2', color: '#dc2626' }}>
                ⚠ Over 80% of your monthly character limit used — consider upgrading your plan.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm italic" style={{ color: 'var(--text-subtle)' }}>Could not reach ElevenLabs API.</p>
        )}
      </div>

      {/* Anthropic */}
      <div className="rounded-2xl p-5 space-y-4"
        style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Anthropic — Last 30 Days</p>

        {anthropic?.totalCalls === 0 ? (
          <p className="text-sm italic" style={{ color: 'var(--text-subtle)' }}>No usage logged yet. Usage will appear here after the next session.</p>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total cost',     value: `$${anthropic.totalCost.toFixed(4)}` },
                { label: 'API calls',      value: anthropic.totalCalls.toLocaleString() },
                { label: 'Input tokens',   value: (anthropic.totalInput / 1000).toFixed(1) + 'K' },
                { label: 'Output tokens',  value: (anthropic.totalOutput / 1000).toFixed(1) + 'K' },
              ].map(s => (
                <div key={s.label} className="rounded-xl px-4 py-3 text-center"
                  style={{ backgroundColor: 'var(--surface-muted)' }}>
                  <p className="text-lg font-black" style={{ color: 'var(--text-strong)' }}>{s.value}</p>
                  <p className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Daily breakdown */}
            {anthropic.byDay?.length > 0 && (
              <div className="space-y-1 pt-2" style={{ borderTop: '1px solid var(--border-default)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Daily breakdown</p>
                {anthropic.byDay.map(d => (
                  <div key={d.day} className="flex items-center gap-3 text-xs py-1">
                    <span className="w-20 shrink-0 font-mono" style={{ color: 'var(--text-subtle)' }}>
                      {new Date(d.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="w-16 text-right font-semibold" style={{ color: 'var(--text-strong)' }}>
                      ${d.cost.toFixed(4)}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{d.calls} call{d.calls !== 1 ? 's' : ''}</span>
                    <span className="ml-auto" style={{ color: 'var(--text-subtle)' }}>
                      {((d.input + d.output) / 1000).toFixed(1)}K tokens
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Cost per user — both services, last 30 days */}
      <div className="rounded-2xl p-5 space-y-3"
        style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)' }}>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Cost Per User — Last 30 Days</p>
          <span className="text-[10px]" style={{ color: 'var(--text-subtle)' }}>ElevenLabs is an allocated estimate</span>
        </div>

        {!byUser || byUser.length === 0 ? (
          <p className="text-sm italic" style={{ color: 'var(--text-subtle)' }}>No per-user usage yet. Appears once users run sessions after this update.</p>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide pb-1"
              style={{ color: 'var(--text-subtle)', borderBottom: '1px solid var(--border-default)' }}>
              <span className="flex-1">User</span>
              <span className="w-20 text-right">Anthropic</span>
              <span className="w-20 text-right">ElevenLabs</span>
              <span className="w-20 text-right font-bold">Total</span>
            </div>
            {byUser.map(u => (
              <div key={u.userId} className="flex items-center gap-3 text-xs py-1.5">
                <span className="flex-1 min-w-0">
                  <span className="font-semibold block truncate" style={{ color: 'var(--text-strong)' }}>{u.fullName ?? 'Unknown'}</span>
                  <span className="block truncate" style={{ color: 'var(--text-subtle)' }}>{u.email}</span>
                </span>
                <span className="w-20 text-right" style={{ color: 'var(--text-muted)' }}>${u.anthropicCost.toFixed(4)}</span>
                <span className="w-20 text-right" style={{ color: 'var(--text-muted)' }}>${u.elevenlabsCost.toFixed(4)}</span>
                <span className="w-20 text-right font-bold" style={{ color: 'var(--text-strong)' }}>${u.totalCost.toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function AdminDashboard({ currentUser, currentProfile, profiles, sessions, relationships, assignmentTeachers }) {
  const [tab, setTab] = useState('students')
  const [search, setSearch] = useState('')

  const students = profiles.filter(p => p.role === 'student')
  const parents  = profiles.filter(p => p.role === 'parent')
  const teachers = profiles.filter(p => p.role === 'teacher')

  // Build lookup maps
  const profileById = Object.fromEntries(profiles.map(p => [p.id, p]))
  const sessionsByStudent = {}
  for (const s of sessions) {
    if (!sessionsByStudent[s.student_id]) sessionsByStudent[s.student_id] = []
    sessionsByStudent[s.student_id].push(s)
  }
  const childrenByParent = {}
  for (const r of relationships) {
    if (!childrenByParent[r.watcher_id]) childrenByParent[r.watcher_id] = []
    childrenByParent[r.watcher_id].push(r.student_id)
  }
  const sessionsByTeacher = {}
  for (const at of assignmentTeachers) {
    if (!sessionsByTeacher[at.teacher_id]) sessionsByTeacher[at.teacher_id] = []
    sessionsByTeacher[at.teacher_id].push(at.session_id)
  }

  const q = search.toLowerCase()

  const filteredStudents = students.filter(s =>
    !q || s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q)
  )
  const filteredParents = parents.filter(p =>
    !q || p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)
  )
  const filteredTeachers = teachers.filter(t =>
    !q || t.full_name?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q)
  )
  const filteredSessions = sessions.filter(s => {
    if (!q) return true
    const student = profileById[s.student_id]
    return (
      s.title?.toLowerCase().includes(q) ||
      s.assignment_text?.toLowerCase().includes(q) ||
      student?.full_name?.toLowerCase().includes(q) ||
      student?.email?.toLowerCase().includes(q)
    )
  })

  const TABS = [
    { id: 'students',  label: `Students (${students.length})` },
    { id: 'parents',   label: `Parents (${parents.length})` },
    { id: 'teachers',  label: `Teachers (${teachers.length})` },
    { id: 'sessions',  label: `All Sessions (${sessions.length})` },
    { id: 'usage',     label: 'Usage & Cost' },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>

      <Navbar user={currentUser} profile={currentProfile} />

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Students',    value: students.length,  emoji: '✏️' },
            { label: 'Parents',     value: parents.length,   emoji: '👪' },
            { label: 'Teachers',    value: teachers.length,  emoji: '📋' },
            { label: 'Assignments', value: sessions.length,  emoji: '📝' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-5 text-center"
              style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)' }}>
              <p className="text-2xl mb-1">{s.emoji}</p>
              <p className="text-3xl font-black" style={{ color: 'var(--text-strong)' }}>{s.value}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabbed view */}
        <div className="space-y-4">

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <TabBar tabs={TABS} active={tab} onChange={t => { setTab(t); setSearch('') }} />
            <div className="w-full sm:w-64">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder={
                  tab === 'sessions' ? 'Search sessions…' : 'Search by name or email…'
                }
              />
            </div>
          </div>

          {/* ── Students ── */}
          {tab === 'students' && (
            <div className="space-y-3">
              {filteredStudents.length === 0 && (
                <p className="text-sm italic text-center py-10" style={{ color: 'var(--text-subtle)' }}>No students found</p>
              )}
              {filteredStudents.map(student => (
                <StudentCard
                  key={student.id}
                  student={student}
                  sessions={sessionsByStudent[student.id] ?? []}
                />
              ))}
            </div>
          )}

          {/* ── Parents ── */}
          {tab === 'parents' && (
            <div className="space-y-3">
              {filteredParents.length === 0 && (
                <p className="text-sm italic text-center py-10" style={{ color: 'var(--text-subtle)' }}>No parents yet</p>
              )}
              {filteredParents.map(parent => {
                const childIds = childrenByParent[parent.id] ?? []
                const childNames = childIds.map(id => profileById[id]?.full_name ?? id.slice(0, 6)).join(', ')
                return (
                  <div key={parent.id} className="rounded-2xl overflow-hidden"
                    style={{ border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)' }}>
                    <PersonRow
                      person={parent}
                      meta={childNames ? `Watching: ${childNames}` : 'No linked students'}
                      showControls
                    />
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Teachers ── */}
          {tab === 'teachers' && (
            <div className="space-y-3">
              {filteredTeachers.length === 0 && (
                <p className="text-sm italic text-center py-10" style={{ color: 'var(--text-subtle)' }}>No teachers yet</p>
              )}
              {filteredTeachers.map(teacher => {
                const sessionIds = sessionsByTeacher[teacher.id] ?? []
                return (
                  <div key={teacher.id} className="rounded-2xl overflow-hidden"
                    style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-xs)' }}>
                    <PersonRow
                      person={teacher}
                      meta={`${sessionIds.length} assignment${sessionIds.length !== 1 ? 's' : ''}`}
                      showControls
                    />
                    {sessionIds.length > 0 && (
                      <div className="px-4 pb-4 pt-1 space-y-2"
                        style={{ borderTop: '1px solid var(--border-default)' }}>
                        {sessionIds.map(sid => {
                          const s = sessions.find(x => x.id === sid)
                          if (!s) return null
                          const studentName = profileById[s.student_id]?.full_name
                          return <SessionRow key={sid} session={s} studentName={studentName} />
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Usage & Cost ── */}
          {tab === 'usage' && <UsageTab />}

          {/* ── All Sessions ── */}
          {tab === 'sessions' && (
            <div className="space-y-2">
              {filteredSessions.length === 0 && (
                <p className="text-sm italic text-center py-10" style={{ color: 'var(--text-subtle)' }}>No sessions found</p>
              )}
              {filteredSessions.map(s => (
                <SessionRow
                  key={s.id}
                  session={s}
                  studentName={profileById[s.student_id]?.full_name ?? s.student_id.slice(0, 8)}
                />
              ))}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
