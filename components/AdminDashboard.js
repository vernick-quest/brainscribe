'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Icon from '@/components/Icon'
import Avatar from '@/components/Avatar'
import { PersonaAvatar } from '@/lib/personas'

// Line-art icons matching the login landing page (Feather/Lucide style). The
// Students/Parents/Teachers glyphs are the same paths used there, so the admin
// page reads as the same product.
const ICON_PROPS = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
const IconStudents = () => (<svg {...ICON_PROPS}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>)
const IconParents  = () => (<svg {...ICON_PROPS}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>)
const IconTeachers = () => (<svg {...ICON_PROPS}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M7 13h4"/><path d="M7 10h10"/><path d="M9 20h6"/><path d="M12 17v3"/></svg>)
const IconAssignments = () => (<svg {...ICON_PROPS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>)
const IconEye = () => (<svg {...ICON_PROPS} width="13" height="13"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>)
const IconChevron = () => (<svg {...ICON_PROPS} width="14" height="14"><path d="M9 18l6-6-6-6"/></svg>)

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
        aria-label="Change role"
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
// Only userId is sent — role + name are resolved server-side (the route ignores
// any client-supplied role/name so a stale payload can't set the wrong identity).
function RemoteInButton({ userId }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const res = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (!res.ok) { setLoading(false); return }
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
      {loading ? '…' : <span className="flex items-center gap-1.5"><IconEye /> Remote in</span>}
    </button>
  )
}

// ── Delete user (with inline confirm) ─────────────────────────
// Permanently removes the account + all its data (cascade). The API refuses to
// delete your own account.
function DeleteUserButton({ userId, name }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setDeleting(true); setError('')
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Delete failed.'); setDeleting(false); return }
      window.location.reload()
    } catch { setError('Network error.'); setDeleting(false) }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5 shrink-0">
        <span className="text-[11px]" style={{ color: 'var(--status-error)' }}>
          {error || `Delete ${name?.split(' ')[0] ?? 'this user'}? This can't be undone.`}
        </span>
        <button onClick={handleDelete} disabled={deleting}
          className="text-[11px] font-bold rounded-full px-2.5 py-1 disabled:opacity-60"
          style={{ backgroundColor: 'var(--status-error)', color: '#fff' }}>
          {deleting ? '…' : 'Delete'}
        </button>
        <button onClick={() => { setConfirming(false); setError('') }} disabled={deleting}
          className="text-[11px] font-semibold rounded-full px-2 py-1" style={{ color: 'var(--text-muted)' }}>
          Cancel
        </button>
      </span>
    )
  }
  return (
    <button onClick={() => setConfirming(true)} title="Delete user" aria-label={`Delete ${name?.split(' ')[0] ?? 'user'}`}
      className="w-9 h-9 flex items-center justify-center rounded-full shrink-0 transition"
      style={{ color: 'var(--text-subtle)' }}
      onMouseEnter={e => e.currentTarget.style.color = 'var(--status-error)'}
      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-subtle)'}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" strokeLinejoin="round" strokeLinecap="round"/>
      </svg>
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

// ── Authored-assignments flag (parents/teachers) ──────────────
// Parents/teachers don't create assignments FOR kids, but the writer experience
// is ownership-based (a `sessions` row with student_id === their profile id), so a
// parent/teacher can author their OWN assignments as a writer. This surfaces how
// many they've authored — an at-a-glance count, muted when none.
function AuthoredBadge({ count }) {
  const has = count > 0
  return (
    <span
      title={has
        ? `Authored ${count} of their own assignment${count !== 1 ? 's' : ''} as a writer`
        : 'Has not authored any assignments of their own'}
      className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 shrink-0"
      style={has
        ? { backgroundColor: '#EEF2FF', color: '#4338CA' }
        : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-subtle)', border: '1px solid var(--border-default)' }}>
      {has ? `${count} authored` : 'None authored'}
    </span>
  )
}

// ── Age flag ───────────────────────────────────────────────────
// At-a-glance age bracket. Under-13 shows parental-consent state (a minor can't
// use a coach until consent is given). "Age?" = never recorded (legacy account).
function AgeBadge({ ageBracket, consentGiven }) {
  let label, title, style
  if (ageBracket === '13plus') {
    label = '13+'; title = '13 or older'
    style = { backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }
  } else if (ageBracket === 'under13') {
    if (consentGiven) {
      label = 'Under 13 ✓'; title = 'Under 13 — parental consent given'
      style = { backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }
    } else {
      label = 'Under 13 ⏳'; title = 'Under 13 — parental consent pending (blocked from coaches)'
      style = { backgroundColor: '#FEF3C7', color: '#92400E' }
    }
  } else {
    label = 'Age?'; title = 'Age not recorded yet'
    style = { backgroundColor: 'var(--surface-muted)', color: 'var(--text-subtle)', border: '1px dashed var(--border-strong)' }
  }
  return (
    <span title={title}
      className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 shrink-0"
      style={style}>
      {label}
    </span>
  )
}

// ── Demo persona control ──────────────────────────────────────
// Seeds (or removes) a demo parent + teacher + 13+ student with two finished
// assignments, so an admin can "Remote in" and preview the parent/teacher views
// through the real rendering code. The student is 13+ on purpose — an under-13
// demo account would be avatar-suppressed AND auto-deleted by the 7-day COPPA
// cron, which would defeat a "repeatable" persona.
const DEMO_EMAILS = [
  'demo-student@brainscribe.io',
  'demo-parent@brainscribe.io',
  'demo-teacher@brainscribe.io',
]

function DemoDataControl({ seeded }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(method) {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/admin/seed-demo', { method })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Request failed.'); setBusy(false); return }
      window.location.reload()
    } catch { setError('Network error.'); setBusy(false) }
  }

  return (
    <div className="rounded-2xl px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2"
      style={{ border: '1px dashed var(--border-strong)', backgroundColor: 'var(--surface-muted)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
          Demo persona {seeded && <span style={{ color: 'var(--status-success)' }}>· active</span>}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {seeded
            ? 'Demo parent, teacher & student (2 finished assignments) exist. Open the Parents or Teachers tab and “Remote in” to preview their views.'
            : 'Create a demo parent, teacher & 13+ student with two finished assignments — then “Remote in” to preview the parent/teacher views with real data.'}
        </p>
        {error && <p className="text-xs mt-1" style={{ color: 'var(--status-error)' }}>{error}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => run('POST')} disabled={busy}
          className="text-xs font-bold rounded-full px-4 py-2 disabled:opacity-60"
          style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
          {busy ? '…' : seeded ? 'Refresh demo data' : 'Seed demo persona'}
        </button>
        {seeded && (
          <button onClick={() => run('DELETE')} disabled={busy}
            className="text-xs font-semibold rounded-full px-3 py-2 disabled:opacity-60"
            style={{ color: 'var(--status-error)', border: '1px solid var(--border-default)' }}>
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

// Maintenance: re-analyze completed essays that never got a writing profile
// (historical fire-and-forget misses). Idempotent — POSTs to the admin-gated
// backfill sweep and reports how many it fixed.
function BackfillWritingProfiles() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function run() {
    setBusy(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/admin/backfill-writing-profiles', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Request failed.'); setBusy(false); return }
      setResult(json)
    } catch { setError('Network error.') }
    setBusy(false)
  }

  return (
    <div className="rounded-2xl px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2"
      style={{ border: '1px dashed var(--border-strong)', backgroundColor: 'var(--surface-muted)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Backfill writing profiles</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Re-analyze completed essays that are missing a writing profile (historical accumulation misses).
          Idempotent — safe to run anytime.
        </p>
        {result && (
          <p className="text-xs mt-1" style={{ color: 'var(--status-success)' }}>
            Scanned {result.scanned} · backfilled {result.backfilled}.
          </p>
        )}
        {error && <p className="text-xs mt-1" style={{ color: 'var(--status-error)' }}>{error}</p>}
      </div>
      <div className="shrink-0">
        <button onClick={run} disabled={busy}
          className="text-xs font-bold rounded-full px-4 py-2 disabled:opacity-60"
          style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
          {busy ? 'Running…' : 'Run backfill'}
        </button>
      </div>
    </div>
  )
}

// Maintenance: reconstruct the coach's opening greeting for historical sessions
// that predate greeting persistence (the opener used to be client-side-only, absent
// from transcripts). Deterministic reconstruction, idempotent.
function BackfillGreetings() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function run() {
    setBusy(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/admin/backfill-greetings', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Request failed.'); setBusy(false); return }
      setResult(json)
    } catch { setError('Network error.') }
    setBusy(false)
  }

  return (
    <div className="rounded-2xl px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2"
      style={{ border: '1px dashed var(--border-strong)', backgroundColor: 'var(--surface-muted)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Backfill opening greetings</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Reconstruct the coach&apos;s opening line for historical transcripts that predate greeting
          persistence (deterministic — reproduces the exact opener). Idempotent — safe to run anytime.
        </p>
        {result && (
          <p className="text-xs mt-1" style={{ color: 'var(--status-success)' }}>
            Scanned {result.scanned} · backfilled {result.backfilled} · skipped {result.skipped}.
          </p>
        )}
        {error && <p className="text-xs mt-1" style={{ color: 'var(--status-error)' }}>{error}</p>}
      </div>
      <div className="shrink-0">
        <button onClick={run} disabled={busy}
          className="text-xs font-bold rounded-full px-4 py-2 disabled:opacity-60"
          style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
          {busy ? 'Running…' : 'Run backfill'}
        </button>
      </div>
    </div>
  )
}

// ── Transcript guardrail audit ────────────────────────────────
// Coach-only trust-and-safety review (brainscribe-transcript-audit). "Run audit"
// samples N never-audited completed transcripts server-side; a Sonnet judge flags
// coach guardrail breaches (the red-team five), a Haiku screen flags technical
// defects. v1 is COACH-ONLY — no student-safety/distress signals by design.
// Opening a finding remotes in as the student first (same fail-closed path as
// SessionRow), then lands on the finished-work transcript.
const SEVERITY_STYLE = {
  high:   { label: 'High',   bg: '#FEE2E2', color: 'var(--status-error)' },
  medium: { label: 'Medium', bg: '#FEF3C7', color: '#92400E' },
  low:    { label: 'Low',    bg: 'var(--surface-muted)', color: 'var(--text-muted)' },
}
const SEVERITY_ORDER = { high: 3, medium: 2, low: 1, none: 0 }
const AUDIT_BREACH_LABEL = {
  evidence_supply: 'Evidence supply',
  fabricated_stats: 'Fabricated statistic',
  compose_as_transcription: 'Compose-as-transcription',
  claim_stitch: 'Claim-stitch',
  coach_authored_frame: 'Coach-authored frame',
}
const PROCESS_LABEL = {
  composition_drift: 'Composition drift',
  stage_rhythm_absence: 'Stage-rhythm absence',
  nugget_miss: 'Nugget miss',
}

function SeverityBadge({ severity }) {
  const s = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.low
  return (
    <span className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 shrink-0"
      style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function AuditFindingCard({ finding, session, student, onChanged }) {
  const [opening, setOpening] = useState(false)
  const [resolved, setResolved] = useState(finding.resolved === true)
  const [notes, setNotes] = useState(finding.admin_notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const a = finding.auditor_analysis ?? {}
  const label = session?.title || session?.assignment_text?.slice(0, 70) || 'Untitled session'
  const tech = a.technical ?? {}

  // Remote in as the student (fail closed), then open the finished-work transcript.
  async function openTranscript() {
    if (opening) return
    setOpening(true)
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: finding.student_id }),
      })
      if (!res.ok) { setOpening(false); return }
    } catch { setOpening(false); return }
    window.location.href = `/transcript/${finding.session_id}`
  }

  async function toggleResolved() {
    const next = !resolved
    setResolved(next)
    try {
      const res = await fetch('/api/admin/audit-findings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: finding.id, resolved: next }),
      })
      if (!res.ok) { setResolved(!next); return }
      onChanged?.()
    } catch { setResolved(!next) }
  }

  async function saveNotes() {
    setSavingNotes(true); setNotesSaved(false)
    try {
      const res = await fetch('/api/admin/audit-findings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: finding.id, admin_notes: notes }),
      })
      if (res.ok) { setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000) }
    } catch {}
    setSavingNotes(false)
  }

  return (
    <div className="rounded-2xl p-5 space-y-3"
      style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-xs)', opacity: resolved ? 0.6 : 1 }}>

      {/* Header: severity, coach, breach chips, student */}
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <PersonaAvatar personaId={finding.persona ?? 'owen'} size={18} className="shrink-0" />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-strong)' }}>
          {finding.persona ?? 'coach'}
        </span>
        {(finding.breach_types ?? []).map(t => (
          <span key={t} className="text-[10px] font-semibold rounded-full px-2 py-0.5"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
            {AUDIT_BREACH_LABEL[t] ?? t}
          </span>
        ))}
        <span className="text-xs ml-auto" style={{ color: 'var(--text-subtle)' }}>
          {formatDate(finding.created_at)}
        </span>
      </div>

      {/* Session + student line */}
      <div>
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-strong)' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {student?.full_name ?? 'Unknown student'}
        </p>
      </div>

      {/* Auditor summary */}
      {a.summary && (
        <p className="text-sm" style={{ color: 'var(--text-default)' }}>{a.summary}</p>
      )}

      {/* Breaches with verbatim quotes */}
      {(a.breaches ?? []).length > 0 && (
        <div className="space-y-2">
          {a.breaches.map((b, i) => (
            <div key={i} className="rounded-xl px-3 py-2 text-xs space-y-1"
              style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
              <div className="flex items-center gap-2">
                <span className="font-bold" style={{ color: 'var(--text-strong)' }}>{AUDIT_BREACH_LABEL[b.type] ?? b.type}</span>
                <SeverityBadge severity={b.severity} />
                <span style={{ color: 'var(--text-subtle)' }}>coach turn #{b.message_index}</span>
              </div>
              <p className="italic" style={{ color: 'var(--text-default)' }}>“{b.quote}”</p>
              {b.rationale && <p style={{ color: 'var(--text-muted)' }}>{b.rationale}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Technical + process signals */}
      {(tech.token_leakage || (tech.truncated_turns ?? []).length > 0 || (a.process_notes ?? []).length > 0) && (
        <div className="flex flex-wrap gap-2">
          {tech.token_leakage && (
            <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: '#FEE2E2', color: 'var(--status-error)' }}>
              control-token leakage
            </span>
          )}
          {(tech.truncated_turns ?? []).length > 0 && (
            <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
              truncated turn(s): {tech.truncated_turns.join(', ')}
            </span>
          )}
          {(a.process_notes ?? []).map((p, i) => (
            <span key={i} title={p.note} className="text-[10px] font-semibold rounded-full px-2 py-0.5"
              style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-subtle)', border: '1px solid var(--border-default)' }}>
              {PROCESS_LABEL[p.type] ?? p.type}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      <textarea value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Admin notes…" rows={2}
        className="w-full text-xs rounded-xl px-3 py-2 resize-y"
        style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-page, var(--bg-page))', color: 'var(--text-default)' }} />

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={openTranscript} disabled={opening}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-full transition disabled:opacity-60"
          style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
          {opening ? '…' : <span className="flex items-center gap-1.5"><IconEye /> Review transcript</span>}
        </button>
        <button onClick={saveNotes} disabled={savingNotes}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-full disabled:opacity-60"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}>
          {savingNotes ? '…' : notesSaved ? 'Saved ✓' : 'Save notes'}
        </button>
        <button onClick={toggleResolved}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-full ml-auto"
          style={resolved
            ? { color: 'var(--text-muted)', border: '1px solid var(--border-default)' }
            : { backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
          {resolved ? 'Reopen' : 'Mark resolved'}
        </button>
      </div>
    </div>
  )
}

function AuditTab({ sessionById, profileById }) {
  const [state, setState] = useState({ loading: true, findings: [], runs: [], error: '' })
  const [running, setRunning] = useState(false)
  const [count, setCount] = useState(10)
  const [showResolved, setShowResolved] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/audit-findings')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setState({ loading: false, findings: [], runs: [], error: json.error ?? 'Failed to load findings.' }); return }
      setState({ loading: false, findings: json.findings ?? [], runs: json.runs ?? [], error: '' })
    } catch { setState(s => ({ ...s, loading: false, error: 'Network error.' })) }
  }, [])

  useEffect(() => { load() }, [load])

  async function runAudit() {
    if (running) return
    setRunning(true)
    let runId = null
    try {
      const res = await fetch('/api/admin/audit-batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setState(s => ({ ...s, error: json.error ?? 'Audit failed to start.' })); setRunning(false); return }
      runId = json.runId
    } catch { setRunning(false); return }

    // Model calls run server-side in after(); poll until this run completes.
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 4000))
      try {
        const res = await fetch('/api/admin/audit-findings')
        const json = await res.json().catch(() => ({}))
        if (res.ok) {
          setState({ loading: false, findings: json.findings ?? [], runs: json.runs ?? [], error: '' })
          const run = (json.runs ?? []).find(r => r.id === runId)
          if (run && run.status !== 'running') break
        }
      } catch {}
    }
    setRunning(false)
  }

  const visible = state.findings
    .filter(f => showResolved || !f.resolved)
    .sort((a, b) => {
      if (!!a.resolved !== !!b.resolved) return a.resolved ? 1 : -1
      const s = (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0)
      if (s) return s
      return new Date(b.created_at) - new Date(a.created_at)
    })
  const lastRun = state.runs[0]
  const openCount = state.findings.filter(f => !f.resolved).length

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="rounded-2xl px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2"
        style={{ border: '1px dashed var(--border-strong)', backgroundColor: 'var(--surface-muted)' }}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
            Transcript guardrail audit
            {openCount > 0 && <span style={{ color: 'var(--status-error)' }}> · {openCount} open</span>}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Samples never-audited completed transcripts and flags coach guardrail breaches. Coach-only — no student-safety monitoring.
            {lastRun && (
              <> Last run: audited {lastRun.audited_count}/{lastRun.requested_count}, {lastRun.findings_count} flagged
                {lastRun.status === 'running' ? ' (running…)' : ''}.</>
            )}
          </p>
          {state.error && <p className="text-xs mt-1" style={{ color: 'var(--status-error)' }}>{state.error}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select value={count} onChange={e => setCount(Number(e.target.value))}
            className="text-xs rounded-full px-3 py-2" style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', color: 'var(--text-default)' }}>
            {[5, 10, 15, 25].map(n => <option key={n} value={n}>{n} transcripts</option>)}
          </select>
          <button onClick={runAudit} disabled={running}
            className="text-xs font-bold rounded-full px-4 py-2 disabled:opacity-60"
            style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
            {running ? 'Auditing…' : 'Run audit'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <button onClick={() => setShowResolved(v => !v)}
          className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
        <button onClick={load} className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Refresh</button>
      </div>

      {/* Findings */}
      {state.loading ? (
        <p className="text-sm italic text-center py-10" style={{ color: 'var(--text-subtle)' }}>Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm italic text-center py-10" style={{ color: 'var(--text-subtle)' }}>
          {state.findings.length === 0 ? 'No findings yet — run an audit to sample transcripts.' : 'No open findings. 🎉'}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map(f => (
            <AuditFindingCard key={f.id} finding={f}
              session={sessionById[f.session_id]}
              student={profileById[f.student_id]}
              onChanged={load} />
          ))}
        </div>
      )}
    </div>
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
function SessionRow({ session, studentName, compact = false, ownerRole }) {
  const [loading, setLoading] = useState(false)
  const label = session.title || session.assignment_text?.slice(0, 60) + (session.assignment_text?.length > 60 ? '…' : '')
  // Mark assignments authored by a parent/teacher (owner is not a student) — the
  // writer experience is ownership-based, so a non-student owner authored it.
  const nonStudentOwner = ownerRole === 'parent' || ownerRole === 'teacher'

  // Opening a session ALWAYS remotes in as its owner first — so the admin is acting
  // as that user (correct name/role, ready to help) and a stale remote-in can never
  // carry over onto someone else's session. Role/name are resolved server-side.
  async function open() {
    if (loading) return
    setLoading(true)
    // Fail closed: if the remote-in doesn't take, do NOT navigate — otherwise a
    // stale impersonation cookie for a different user would carry onto this
    // session (the exact thing remoting-in-first is meant to prevent).
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.student_id }),
      })
      if (!res.ok) { setLoading(false); return }
    } catch { setLoading(false); return }
    window.location.href = `/assignment/${session.id}`
  }

  return (
    <button onClick={open} disabled={loading}
      className="w-full text-left flex items-center gap-3 rounded-xl px-4 py-3 transition group disabled:opacity-60"
      style={{
        border: '1px solid var(--border-default)',
        backgroundColor: 'var(--surface-card)',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.backgroundColor = 'var(--surface-spark)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.backgroundColor = 'var(--surface-card)' }}>

      <PersonaAvatar personaId={session.persona ?? 'owen'} size={22} className="shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-strong)' }}>{label}</p>
        {!compact && studentName && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{studentName}</p>
        )}
      </div>

      {nonStudentOwner && (
        <span title={`Authored by a ${ownerRole} as a writer (not created for a student)`}
          className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 shrink-0"
          style={{ backgroundColor: '#EEF2FF', color: '#4338CA' }}>
          by {ownerRole}
        </span>
      )}

      <StatusBadge status={session.status} />

      <span className="text-xs shrink-0" style={{ color: 'var(--text-subtle)' }}>
        {/* Completed sessions show WHEN they were finished (completed_at), not when
            the row was last touched — a profile recompute/backfill bumps updated_at
            (BEFORE UPDATE trigger) and would otherwise make a done essay read as
            freshly completed. Active sessions keep updated_at (last-activity). */}
        {formatDate(
          (session.status === 'complete' && session.completed_at)
            ? session.completed_at
            : (session.updated_at ?? session.created_at)
        )}
      </span>

      <span className="text-xs opacity-0 group-hover:opacity-100 transition shrink-0"
        style={{ color: 'var(--accent)' }}>→</span>
    </button>
  )
}

// ── Unified user card (students, parents, teachers) ───────────
// ONE card shell for all three roles so they look identical: same shell
// (rounded-2xl / --border-default / --surface-card / --shadow-xs), same header
// padding (px-5 py-4), same Avatar size (36), same name (text-sm font-semibold)
// + email treatment, same badge-pill styling, same controls order, and the same
// collapse-by-default expand behavior (chevron). Role-specific CONTENT is passed
// in — `meta` (a one-line descriptor), `stat` (a leading pill/badge node), and
// `children` (the expandable body: student sessions, or authored/linked lists).
// `hasBody` gates the chevron + body region (a card with nothing to expand is
// still the same chrome, just non-collapsible).
//
// Controls are reused verbatim (Avatar COPPA under-13 suppression, OnboardingBadge
// toggle, AgeBadge, RoleEditor self-lockout guard, RemoteInButton impersonation,
// DeleteUserButton) — this card only restyles the shell they sit in.
function PersonCard({ person, meta, stat, hasBody = false, onRoleChanged, children }) {
  const [open, setOpen] = useState(false)
  const toggle = () => { if (hasBody) setOpen(o => !o) }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-xs)' }}>

      <div className="flex items-center gap-3 px-5 py-4">
        {/* Avatar — under-13 accounts are hard-suppressed to initials inside Avatar (COPPA) */}
        <Avatar name={person.full_name} avatarUrl={person.avatar_url} ageBracket={person.age_bracket} size={36} />

        {/* Name + email — clickable to expand when there's a body */}
        <button className="flex-1 min-w-0 text-left disabled:cursor-default" onClick={toggle} disabled={!hasBody}>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
            {person.full_name ?? '—'}
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{person.email}</p>
        </button>

        {/* Stats + controls */}
        <div className="flex items-center gap-2 shrink-0">
          {meta && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{meta}</span>}
          {stat}
          <AgeBadge ageBracket={person.age_bracket} consentGiven={person.coppa_consent_given} />
          <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>{formatDate(person.created_at)}</span>
          <OnboardingBadge userId={person.id} complete={person.onboarding_complete === true} />
          <RoleEditor userId={person.id} currentRole={person.role} onChanged={onRoleChanged} />
          <RemoteInButton userId={person.id} />
          <DeleteUserButton userId={person.id} name={person.full_name} />
          <button onClick={toggle} disabled={!hasBody}
            className="flex items-center transition-transform disabled:opacity-25"
            style={{ color: 'var(--text-subtle)', transform: open ? 'rotate(90deg)' : 'none' }}
            aria-label={!hasBody ? 'Nothing to expand' : open ? 'Collapse' : 'Expand'}>
            <IconChevron />
          </button>
        </div>
      </div>

      {hasBody && open && (
        <div className="px-5 pb-4 pt-1 space-y-2"
          style={{ borderTop: '1px solid var(--border-default)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// Completed-sessions stat pill (student "N ✓") — matches the AuthoredBadge pill
// dimensions so the stat slot reads identically across roles.
function CompletedStat({ count }) {
  if (count <= 0) return null
  return (
    <span className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 shrink-0"
      style={{ backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
      {count} ✓
    </span>
  )
}

// ── Search bar ─────────────────────────────────────────────────
function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex" style={{ color: 'var(--text-subtle)' }}><Icon name="search" size={14} /></span>
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

  const { anthropic, elevenlabs, byCategory, byUser, unattributed } = data ?? {}

  // Cost buckets — collapse the api_usage categories into 3 display rows.
  // user → Users · testing → Testing · internal+other → Other / Internal.
  const bucketDefs = [
    { key: 'users',   label: 'Users',            cats: ['user'] },
    { key: 'testing', label: 'Testing',          cats: ['testing'] },
    { key: 'other',   label: 'Other / Internal', cats: ['internal', 'other'] },
  ]
  const buckets = bucketDefs.map(b => {
    const rows = (byCategory ?? []).filter(r => b.cats.includes(r.category))
    return {
      ...b,
      cost: rows.reduce((s, r) => s + r.cost, 0),
      calls: rows.reduce((s, r) => s + r.calls, 0),
      isEstimate: rows.some(r => r.isEstimate),
    }
  })
  const bucketTotal = buckets.reduce((s, b) => s + b.cost, 0)
  const bucketsSorted = [...buckets].sort((a, b) => b.cost - a.cost)
  const anyEstimate = buckets.some(b => b.isEstimate)

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
              <p className="text-xs font-semibold rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
                style={{ backgroundColor: '#FEF2F2', color: '#dc2626' }}>
                <Icon name="alert" size={14} style={{ color: 'var(--status-error)' }} /> Over 80% of your monthly character limit used — consider upgrading your plan.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm italic" style={{ color: 'var(--text-subtle)' }}>Could not reach ElevenLabs API.</p>
        )}
      </div>

      {/* Cost by bucket — Users / Testing / Other, last 30 days */}
      <div className="rounded-2xl p-5 space-y-4"
        style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)' }}>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Cost by Bucket — Last 30 Days</p>
          <span className="text-[10px]" style={{ color: 'var(--text-subtle)' }}>Anthropic spend</span>
        </div>

        {bucketTotal === 0 ? (
          <p className="text-sm italic" style={{ color: 'var(--text-subtle)' }}>No bucketed usage yet. Requires migration 028 and at least one categorized call.</p>
        ) : (
          <>
            <div className="space-y-3">
              {bucketsSorted.map(b => {
                const pct = bucketTotal > 0 ? (b.cost / bucketTotal) * 100 : 0
                return (
                  <div key={b.key} className="space-y-1.5">
                    <div className="flex items-baseline gap-2 text-xs">
                      <span className="font-semibold" style={{ color: 'var(--text-strong)' }}>{b.label}</span>
                      {b.isEstimate && (
                        <span className="text-[10px] rounded-full px-1.5 py-px"
                          style={{ backgroundColor: 'var(--surface-spark)', color: 'var(--accent-text)' }}>est.</span>
                      )}
                      <span className="ml-auto font-bold tabular-nums" style={{ color: 'var(--text-strong)' }}>${b.cost.toFixed(2)}</span>
                      <span className="w-12 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-muted)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: 'var(--accent)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
            {anyEstimate && (
              <p className="text-[11px] leading-snug pt-1" style={{ color: 'var(--text-subtle)' }}>
                Testing before 2026-07-09 is estimated; instrumented runs after are exact. Source of truth: Anthropic Console.
              </p>
            )}
          </>
        )}
      </div>

      {/* Anthropic — production / users only */}
      <div className="rounded-2xl p-5 space-y-4"
        style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)' }}>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>Anthropic — Last 30 Days</p>
          <span className="text-[10px]" style={{ color: 'var(--text-subtle)' }}>Users / production</span>
        </div>

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

        {(!byUser || byUser.length === 0) && !unattributed ? (
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
            {(byUser ?? []).map(u => (
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

            {/* Deleted / unattributed — orphaned spend (user_id nulled on delete,
                migration 013). Surfaced so the per-user rows reconcile with the total. */}
            {unattributed && (
              <div className="flex items-center gap-3 text-xs py-1.5"
                style={{ borderTop: '1px dashed var(--border-default)' }}>
                <span className="flex-1 min-w-0">
                  <span className="font-semibold block truncate italic" style={{ color: 'var(--text-muted)' }}>Deleted / unattributed</span>
                  <span className="block truncate" style={{ color: 'var(--text-subtle)' }}>
                    {unattributed.rowCount} orphaned row{unattributed.rowCount !== 1 ? 's' : ''} — deleted accounts, no PII
                  </span>
                </span>
                <span className="w-20 text-right" style={{ color: 'var(--text-muted)' }}>${unattributed.anthropicCost.toFixed(4)}</span>
                <span className="w-20 text-right" style={{ color: 'var(--text-muted)' }}>${unattributed.elevenlabsCost.toFixed(4)}</span>
                <span className="w-20 text-right font-bold" style={{ color: 'var(--text-strong)' }}>${unattributed.totalCost.toFixed(4)}</span>
              </div>
            )}

            {/* Reconciled total = attributed users + unattributed orphans */}
            {(() => {
              const attributedTotal = (byUser ?? []).reduce((s, u) => s + u.totalCost, 0)
              const grandTotal = attributedTotal + (unattributed?.totalCost ?? 0)
              return (
                <div className="flex items-center gap-3 text-xs pt-2 mt-1"
                  style={{ borderTop: '1px solid var(--border-default)' }}>
                  <span className="flex-1 font-bold uppercase tracking-wide text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                    Total (reconciled)
                  </span>
                  <span className="w-20 text-right" />
                  <span className="w-20 text-right" />
                  <span className="w-20 text-right font-black" style={{ color: 'var(--text-strong)' }}>${grandTotal.toFixed(4)}</span>
                </div>
              )
            })()}
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

  // Demo persona present if all three demo accounts exist.
  const demoSeeded = DEMO_EMAILS.every(email =>
    profiles.some(p => p.email?.toLowerCase() === email))

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
    { id: 'audit',     label: 'Audit' },
    { id: 'usage',     label: 'Usage & Cost' },
  ]

  const sessionById = Object.fromEntries(sessions.map(s => [s.id, s]))

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>

      <Navbar user={currentUser} profile={currentProfile} />

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">

        {/* Demo persona seeder — preview parent/teacher views via Remote in */}
        <DemoDataControl seeded={demoSeeded} />

        {/* Maintenance: re-analyze completed essays missing a writing profile */}
        <BackfillWritingProfiles />

        {/* Maintenance: reconstruct opening greetings for historical transcripts */}
        <BackfillGreetings />

        {/* Stats — icon chips mirror the login landing page */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Students',    value: students.length, Icon: IconStudents,    iconBg: 'var(--navy-100)',           iconColor: 'var(--navy-700)' },
            { label: 'Parents',     value: parents.length,  Icon: IconParents,     iconBg: 'var(--status-success-bg)',  iconColor: 'var(--status-success)' },
            { label: 'Teachers',    value: teachers.length, Icon: IconTeachers,    iconBg: 'var(--surface-spark)',      iconColor: 'var(--accent)' },
            { label: 'Assignments', value: sessions.length, Icon: IconAssignments, iconBg: '#EEF2FF',                   iconColor: '#4338CA' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-5 text-center"
              style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xs)' }}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2"
                style={{ backgroundColor: s.iconBg, color: s.iconColor }}>
                <s.Icon />
              </div>
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
              {filteredStudents.map(student => {
                const sessions = sessionsByStudent[student.id] ?? []
                const completedCount = sessions.filter(s => s.status === 'complete').length
                return (
                  <PersonCard
                    key={student.id}
                    person={student}
                    meta={`${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
                    stat={<CompletedStat count={completedCount} />}
                    hasBody={sessions.length > 0}
                  >
                    {sessions.map(s => <SessionRow key={s.id} session={s} compact />)}
                  </PersonCard>
                )
              })}
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
                const ownSessions = sessionsByStudent[parent.id] ?? []
                return (
                  <PersonCard
                    key={parent.id}
                    person={parent}
                    meta={childNames ? `Watching: ${childNames}` : 'No linked students'}
                    stat={<AuthoredBadge count={ownSessions.length} />}
                    hasBody={ownSessions.length > 0}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-widest pt-1" style={{ color: 'var(--text-subtle)' }}>
                      Own assignments (authored as a writer)
                    </p>
                    {ownSessions.map(s => (
                      <SessionRow key={s.id} session={s} ownerRole={parent.role} compact />
                    ))}
                  </PersonCard>
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
                const ownSessions = sessionsByStudent[teacher.id] ?? []
                return (
                  <PersonCard
                    key={teacher.id}
                    person={teacher}
                    meta={`Linked to ${sessionIds.length} assignment${sessionIds.length !== 1 ? 's' : ''}`}
                    stat={<AuthoredBadge count={ownSessions.length} />}
                    hasBody={sessionIds.length > 0 || ownSessions.length > 0}
                  >
                    {sessionIds.length > 0 && (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-widest pt-1" style={{ color: 'var(--text-subtle)' }}>
                          Linked assignments (student-owned)
                        </p>
                        {sessionIds.map(sid => {
                          const s = sessions.find(x => x.id === sid)
                          if (!s) return null
                          const studentName = profileById[s.student_id]?.full_name
                          const ownerRole = profileById[s.student_id]?.role
                          return <SessionRow key={sid} session={s} studentName={studentName} ownerRole={ownerRole} />
                        })}
                      </>
                    )}
                    {ownSessions.length > 0 && (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-widest pt-1" style={{ color: 'var(--text-subtle)' }}>
                          Own assignments (authored as a writer)
                        </p>
                        {ownSessions.map(s => (
                          <SessionRow key={s.id} session={s} ownerRole={teacher.role} compact />
                        ))}
                      </>
                    )}
                  </PersonCard>
                )
              })}
            </div>
          )}

          {/* ── Transcript guardrail audit ── */}
          {tab === 'audit' && <AuditTab sessionById={sessionById} profileById={profileById} />}

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
                  ownerRole={profileById[s.student_id]?.role}
                />
              ))}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
