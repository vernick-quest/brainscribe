'use client'

import { useState, useTransition, useEffect, useCallback, useContext, createContext, useRef } from 'react'
import DraftIntegrityAlert from '@/components/DraftIntegrityAlert'
import { useTabTitle } from '@/components/TabTitle'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Icon from '@/components/Icon'
import Avatar from '@/components/Avatar'
import { PersonaAvatar } from '@/lib/personas'
import { DEMO_EMAILS } from '@/lib/demoAccounts'
import { unwrapPastedText } from '@/lib/unwrapText'
import { breachKey, breachProgress, summaryContradictsBreaches } from '@/lib/auditBreach'
import { presenceLabel, isActiveNow } from '@/lib/presence'
import { HEALTH_SIGNALS } from '@/lib/sessionHealth'

const HEALTH_SIGNAL_LABEL = Object.fromEntries(Object.entries(HEALTH_SIGNALS).map(([k, v]) => [k, v.label]))

// Paste handler for the admin note fields. Text copied from a terminal, chat pane, or
// email is hard-wrapped at ~80 columns, and those newlines are real — pasted in, a note
// stops a third of the way across a wide box with a ragged right edge and reads as a
// broken input. Unwrap the cosmetic breaks on the way in (paragraph breaks and list
// items are preserved) and keep the caret where the user expects it.
function handleUnwrapPaste(e, setValue) {
  const raw = e.clipboardData?.getData('text/plain')
  if (!raw || !raw.includes('\n')) return // nothing to unwrap — let the browser do it
  e.preventDefault()
  const el = e.target
  const clean = unwrapPastedText(raw)
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const next = el.value.slice(0, start) + clean + el.value.slice(end)
  setValue(next)
  requestAnimationFrame(() => {
    const caret = start + clean.length
    try { el.setSelectionRange(caret, caret) } catch {}
  })
}

// Line-art icons matching the login landing page (Feather/Lucide style). The
// Students/Parents/Teachers glyphs are the same paths used there, so the admin
// page reads as the same product.
const ICON_PROPS = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
const IconStudents = () => (<svg {...ICON_PROPS}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>)
const IconParents  = () => (<svg {...ICON_PROPS}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>)
const IconTeachers = () => (<svg {...ICON_PROPS}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M7 13h4"/><path d="M7 10h10"/><path d="M9 20h6"/><path d="M12 17v3"/></svg>)
const IconAssignments = () => (<svg {...ICON_PROPS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>)

// Column/status glyphs for the student roster — same Feather family, sized small.
const SM = { ...ICON_PROPS, width: 15, height: 15 }
const IconLogins    = () => (<svg {...SM}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>)
const IconDoc       = () => (<svg {...SM}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>)
const IconCheck     = () => (<svg {...SM}><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>)
const IconWarnTri   = () => (<svg {...SM}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>)
const IconEyeSm     = () => (<svg {...SM}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>)
// FTUE states — three, and visually distinct at a glance.
const IconSkipped   = () => (<svg {...SM}><circle cx="12" cy="12" r="9"/><path d="M9 8.5l4 3.5-4 3.5"/><path d="M15.5 8.5v7"/></svg>)
const IconNotOnb    = () => (<svg {...SM}><circle cx="12" cy="12" r="9" strokeDasharray="3 3"/></svg>)

// Shared column geometry — the header, every row, and the legend all read from this,
// so the numbers stay under their glyph instead of drifting apart.
const COL = 'w-14 shrink-0 text-center tabular-nums'
// Header cells centre a GLYPH, not text. `text-center` centres inline content but an
// svg does not reliably fill the cell, so the icon drifted off the column's centre
// line while the numbers below it were centred. A flex cell centres the glyph on the
// same axis as the numbers — and gives the tooltip the FULL column as its hit area
// instead of just the few pixels of the glyph itself.
const COL_HEAD = 'w-14 shrink-0 flex items-center justify-center'
const IconEye = () => (<svg {...ICON_PROPS} width="13" height="13"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>)
const IconChevron = () => (<svg {...ICON_PROPS} width="14" height="14"><path d="M9 18l6-6-6-6"/></svg>)

const ROLE_COLOR = {
  student: { bg: 'var(--accent-soft)', text: 'var(--accent)' },
  parent:  { bg: 'var(--status-success-bg)', text: 'var(--status-success)' },
  teacher: { bg: 'var(--primary-soft)', text: 'var(--text-link)' },
  admin:   { bg: 'var(--status-thin-bg)', text: 'var(--text-body)' },
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
          style={{ backgroundColor: 'var(--status-error)', color: 'var(--text-on-accent)' }}>
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
// Three states, not two. `onboarding_complete` is a ROUTING flag — it only means "stop
// sending this person to /onboarding" — and BOTH skip buttons set it. So a parent who
// clicked "Skip — go to my dashboard" 2 minutes after signing up rendered identically to
// a student who wrote a practice paragraph, which is exactly how a real parent's status
// got misread on 2026-08-01. `practiced` is the truth, derived from sessions rather than
// from the flag: did they actually finish a practice assignment?
function OnboardingBadge({ userId, complete, practiced }) {
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

  const state = !done ? 'none' : practiced ? 'practiced' : 'skipped'
  const label = { practiced: 'Practiced ✓', skipped: 'Skipped', none: 'Not onboarded' }[state]
  const title = {
    practiced: 'Finished a practice assignment — click to reset (they’ll go through onboarding again next sign-in)',
    skipped: 'Marked onboarded WITHOUT finishing a practice assignment (they used a skip link) — click to reset',
    none: 'Not onboarded — click to mark complete',
  }[state]
  const tone = {
    practiced: { backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' },
    // Amber, not green: nothing is wrong, but it is not the same thing and the panel
    // should never imply it is.
    skipped: { backgroundColor: 'var(--status-thin-bg)', color: 'var(--text-body)' },
    none: { backgroundColor: 'var(--surface-muted)', color: 'var(--text-subtle)', border: '1px solid var(--border-default)' },
  }[state]

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={title}
      className="text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5 transition shrink-0 cursor-pointer"
      style={tone}
    >
      {saving ? '…' : label}
    </button>
  )
}

// Icon-only FTUE state for the student roster — same three states and the same
// click-to-toggle as OnboardingBadge, but a glyph instead of a word so the row can
// lead with the name. The legend under the roster names the three glyphs.
function OnboardingIcon({ userId, complete, practiced }) {
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

  const state = !done ? 'none' : practiced ? 'practiced' : 'skipped'
  const { Glyph, color, title } = {
    practiced: { Glyph: IconCheck, color: 'var(--status-success)', title: 'Practiced — finished a practice assignment. Click to reset (they’ll onboard again next sign-in)' },
    // Amber, not green: nothing is wrong, but it is not the same thing.
    skipped: { Glyph: IconSkipped, color: 'var(--status-thin)', title: 'Skipped — marked onboarded WITHOUT finishing a practice assignment. Click to reset' },
    none: { Glyph: IconNotOnb, color: 'var(--text-subtle)', title: 'Not onboarded — click to mark complete' },
  }[state]

  return (
    <button onClick={toggle} disabled={saving} title={title} aria-label={title}
      className="shrink-0 flex items-center transition cursor-pointer disabled:opacity-50"
      style={{ color }}>
      {saving ? <span className="text-[11px]">…</span> : <Glyph />}
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
        ? { backgroundColor: 'var(--primary-soft)', color: 'var(--text-link)' }
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
      style = { backgroundColor: 'var(--status-thin-bg)', color: 'var(--text-body)' }
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
  high:   { label: 'High',   bg: 'var(--status-error-bg)', color: 'var(--status-error)' },
  medium: { label: 'Medium', bg: 'var(--status-thin-bg)', color: 'var(--text-body)' },
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

// Judge-accuracy dispositions. Kept in sync with the CHECK constraint in migration 060
// and the DISPOSITIONS list in the audit-findings route.
const DISPOSITION_OPTIONS = [
  { key: 'confirmed',      label: 'Confirmed',      title: 'Real breach, severity fits',                bg: 'var(--status-success-bg)', fg: 'var(--status-success)' },
  { key: 'over_severe',    label: 'Over-severe',    title: 'Real breach, but graded harsher than it deserved', bg: 'var(--status-thin-bg)', fg: 'var(--status-thin)' },
  { key: 'false_positive', label: 'False positive', title: 'Not a breach — the judge was wrong',        bg: 'var(--status-error-bg)',   fg: 'var(--status-error)' },
]

// One breach inside a finding, with its OWN note and resolution. A session routinely
// holds several distinct errors (one real assignment has three); answering them as a
// single unit meant a fixed error and an open one shared a verdict.
function BreachBlock({ breach: b, findingId, review, onChanged }) {
  const key = breachKey(b)
  const [resolved, setResolved] = useState(review?.resolved === true)
  const [note, setNote] = useState(review?.note ?? '')
  const [disposition, setDisposition] = useState(review?.disposition ?? null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  // Re-sync if a refetch brings a newer verdict for this breach.
  const srvResolved = review?.resolved === true
  const srvNote = review?.note ?? ''
  const srvDisp = review?.disposition ?? null
  useEffect(() => { setResolved(srvResolved); setNote(srvNote); setDisposition(srvDisp) }, [srvResolved, srvNote, srvDisp])

  async function save(patch) {
    setSaving(true); setErr(''); setSaved(false)
    try {
      const res = await fetch('/api/admin/audit-findings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: findingId, breachKey: key, ...patch }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) { setErr(json.error ?? 'Save failed.'); return false }
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      onChanged?.()
      return true
    } catch { setErr('Network error.'); return false }
    finally { setSaving(false) }
  }

  async function toggleResolved() {
    const next = !resolved
    setResolved(next)
    const ok = await save({ resolved: next, admin_notes: note })
    if (!ok) setResolved(!next)
  }

  return (
    <div className="rounded-xl px-3 py-2 text-xs space-y-1.5"
      style={{
        backgroundColor: 'var(--surface-muted)',
        border: '1px solid var(--border-default)',
        opacity: resolved ? 0.65 : 1,
      }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold" style={{ color: 'var(--text-strong)' }}>{AUDIT_BREACH_LABEL[b.type] ?? b.type}</span>
        <SeverityBadge severity={b.severity} />
        <span style={{ color: 'var(--text-subtle)' }}>coach turn #{b.message_index}</span>
        {resolved && (
          <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
            style={{ backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
            Resolved
          </span>
        )}
      </div>
      <p className="italic" style={{ color: 'var(--text-default)' }}>“{b.quote}”</p>
      {b.rationale && <p style={{ color: 'var(--text-muted)' }}>{b.rationale}</p>}

      {/* Was the judge right? Optional, and separate from "have I dealt with it" —
          this is what turns severity calibration into a query ("what share of HIGH
          findings did a human confirm?") instead of a recollection. */}
      <div className="flex items-center gap-1.5 flex-wrap pt-1">
        <span style={{ color: 'var(--text-subtle)' }}>Judge was:</span>
        {DISPOSITION_OPTIONS.map(d => {
          const active = disposition === d.key
          return (
            <button key={d.key} type="button" disabled={saving} title={d.title}
              onClick={() => { const next = active ? null : d.key; setDisposition(next); save({ disposition: next }) }}
              aria-pressed={active}
              className="text-[10px] font-semibold rounded-full px-2 py-0.5 transition cursor-pointer disabled:opacity-60"
              style={active
                ? { backgroundColor: d.bg, color: d.fg }
                : { backgroundColor: 'var(--surface-card)', color: 'var(--text-subtle)', border: '1px solid var(--border-default)' }}>
              {d.label}
            </button>
          )
        })}
      </div>

      {/* This error's own note + verdict */}
      <div className="flex items-start gap-2 pt-1">
        <textarea value={note}
          onChange={e => setNote(e.target.value)}
          onPaste={e => handleUnwrapPaste(e, setNote)}
          placeholder="Note for this error…" rows={2}
          className="flex-1 min-w-0 text-xs rounded-lg px-2 py-1.5 resize-y"
          style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', color: 'var(--text-default)' }} />
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={() => save({ admin_notes: note })} disabled={saving}
            className="text-[10px] font-semibold px-2 py-1 rounded-full transition disabled:opacity-60 cursor-pointer"
            style={{ border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>
            {saving ? '…' : saved ? 'Saved' : 'Save note'}
          </button>
          <button onClick={toggleResolved} disabled={saving}
            className="text-[10px] font-bold px-2 py-1 rounded-full transition disabled:opacity-60 cursor-pointer"
            style={resolved
              ? { backgroundColor: 'var(--surface-card)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }
              : { backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }}>
            {resolved ? 'Re-open' : 'Resolve'}
          </button>
        </div>
      </div>
      {err && <p style={{ color: 'var(--status-error)' }}>{err}</p>}
    </div>
  )
}

function AuditFindingCard({ finding, session, student, breachReviews, onChanged }) {
  const [opening, setOpening] = useState(false)
  const [resolved, setResolved] = useState(finding.resolved === true)
  const [notes, setNotes] = useState(finding.admin_notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const a = finding.auditor_analysis ?? {}
  const label = session?.title || session?.assignment_text?.slice(0, 70) || 'Untitled session'
  const tech = a.technical ?? {}
  const progress = breachProgress(a.breaches, breachReviews)
  const hasBreaches = progress.total > 0
  const summaryContradicts = summaryContradictsBreaches(a.summary, a.breaches)

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

      {/* Header: severity, STUDENT, breach chips, date.
          The STUDENT leads, not the coach — a finding is about a real kid's session,
          and the persona turns out not to predict the failure: compose-as-transcription
          has been produced by four different coaches, so it's a systemic mode, not a
          persona trait. The coach is kept as a de-emphasized attribution below. */}
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        {/* COPPA: Avatar hard-suppresses under-13 to initials */}
        <Avatar name={student?.full_name} avatarUrl={student?.avatar_url}
          ageBracket={student?.age_bracket} size={20} />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-strong)' }}>
          {student?.full_name ?? 'Unknown student'}
        </span>
        {(finding.breach_types ?? []).map(t => (
          <span key={t} className="text-[10px] font-semibold rounded-full px-2 py-0.5"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
            {AUDIT_BREACH_LABEL[t] ?? t}
          </span>
        ))}
        {progress.total > 0 && (
          <span className="text-[10px] font-semibold rounded-full px-2 py-0.5"
            title="Errors in this session that have their own verdict"
            style={progress.allResolved
              ? { backgroundColor: 'var(--status-success-bg)', color: 'var(--status-success)' }
              : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}>
            {progress.resolved}/{progress.total} errors resolved
          </span>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--text-subtle)' }}>
          {formatDate(finding.created_at)}
        </span>
      </div>

      {/* Assignment, then the coach as quiet attribution */}
      <div>
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-strong)' }}>{label}</p>
        <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-subtle)' }}>
          <PersonaAvatar personaId={finding.persona ?? 'owen'} size={14} className="shrink-0" />
          coached by {finding.persona ?? 'coach'}
        </p>
      </div>

      {/* Auditor summary. A summary generated BEFORE the breaches (old schema order)
          could claim the session was clean and then list three HIGH breaches beneath
          it. New findings can't do that, but ones already stored keep their prose —
          so label it rather than presenting a contradiction as fact. */}
      {a.summary && (
        <div>
          {summaryContradicts && (
            <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--status-error)' }}>
              ⚠ This summary contradicts the {(a.breaches ?? []).length} finding{(a.breaches ?? []).length === 1 ? '' : 's'} below — it was written before the breach analysis. Trust the findings.
            </p>
          )}
          <p className="text-sm" style={{ color: summaryContradicts ? 'var(--text-subtle)' : 'var(--text-default)' }}>
            {a.summary}
          </p>
        </div>
      )}

      {/* Breaches with verbatim quotes */}
      {(a.breaches ?? []).length > 0 && (
        <div className="space-y-2">
          {a.breaches.map((b, i) => (
            <BreachBlock key={breachKey(b, i)} breach={b} findingId={finding.id}
              review={breachReviews?.[breachKey(b, i)]} onChanged={onChanged} />
          ))}
        </div>
      )}

      {/* Technical + process signals */}
      {(tech.token_leakage || (tech.truncated_turns ?? []).length > 0 || (a.process_notes ?? []).length > 0) && (
        <div className="flex flex-wrap gap-2">
          {tech.token_leakage && (
            <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: 'var(--status-error-bg)', color: 'var(--status-error)' }}>
              control-token leakage
            </span>
          )}
          {(tech.truncated_turns ?? []).length > 0 && (
            <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: 'var(--status-thin-bg)', color: 'var(--text-body)' }}>
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

      {/* A technical-only finding (no breaches — e.g. a truncated turn) has no error
          block to answer, so it keeps its own note + resolve. When breaches DO exist,
          each one carries its own verdict and the finding's resolved state is derived
          from them server-side: a second central control could only ever disagree with
          the parts it summarises. */}
      {!hasBreaches && (
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          onPaste={e => handleUnwrapPaste(e, setNotes)}
          placeholder="Notes on this technical finding…" rows={2}
          className="w-full text-xs rounded-xl px-3 py-2 resize-y"
          style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-page, var(--bg-page))', color: 'var(--text-default)' }} />
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={openTranscript} disabled={opening}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-full transition disabled:opacity-60"
          style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
          {opening ? '…' : <span className="flex items-center gap-1.5"><IconEye /> Review transcript</span>}
        </button>
        {!hasBreaches && (
          <>
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
          </>
        )}
        {hasBreaches && (
          <span className="text-[11px] ml-auto" style={{ color: 'var(--text-subtle)' }}>
            {progress.allResolved
              ? 'All errors resolved — this finding is closed'
              : `Resolve each error above (${progress.resolved}/${progress.total} done)`}
          </span>
        )}
      </div>
    </div>
  )
}


// ── Student work at risk ────────────────────────────────────────────────────────
// Mechanical findings from the nightly deterministic pass. Kept visually apart from
// judge findings: a red-bordered block with its own heading, because "the student's
// writing may be gone" and "the coach could have phrased that better" are not the same
// class of problem and must not be dismissible with the same shrug.
const HEALTH_TONE = {
  critical: { bg: 'var(--status-error-bg)', fg: 'var(--status-error)', word: 'AT RISK' },
  high:     { bg: 'var(--status-error-bg)', fg: 'var(--status-error)', word: 'HIGH' },
  medium:   { bg: 'var(--status-thin-bg)',  fg: 'var(--status-thin)',  word: 'CHECK' },
}

function SessionHealthPanel({ sessionById, profileById }) {
  const [state, setState] = useState({ loading: true, findings: [], pending: false, error: '' })
  const [showPre, setShowPre] = useState(false)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/session-health', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setState({ loading: false, findings: [], pending: false, error: json.error ?? 'Failed to load.' }); return }
      setState({ loading: false, findings: json.findings ?? [], pending: !!json.pending, error: '' })
    } catch { setState(s => ({ ...s, loading: false, error: 'Network error.' })) }
  }, [])
  useEffect(() => { load() }, [load])

  async function rerun() {
    setRunning(true)
    try { await fetch('/api/admin/session-health', { method: 'POST' }); await load() }
    catch {} finally { setRunning(false) }
  }

  async function acknowledge(f, next) {
    await fetch('/api/admin/session-health', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: f.session_id, signal: f.signal, acknowledged: next }),
    })
    load()
  }

  if (state.loading) return null
  if (state.pending) {
    return (
      <div className="rounded-2xl px-4 py-3 text-xs"
        style={{ border: '1px dashed var(--border-strong)', color: 'var(--text-muted)' }}>
        Session-health pass is deployed but migration 069 has not been applied yet — no findings can be stored.
      </div>
    )
  }

  const open = state.findings.filter(f => !f.acknowledged)
  const live = open.filter(f => !f.pre_existing)
  const pre = open.filter(f => f.pre_existing)
  const shown = showPre ? open : live
  const worst = live.some(f => f.severity === 'critical')

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: `2px solid ${live.length ? 'var(--status-error)' : 'var(--border-default)'}`,
               backgroundColor: live.length ? 'var(--status-error-bg)' : 'var(--surface-card)' }}>
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
          {live.length ? `${live.length} session${live.length === 1 ? '' : 's'} where student work may be at risk` : 'Student work: nothing at risk'}
        </span>
        {worst && (
          <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
            style={{ backgroundColor: 'var(--status-error)', color: 'white' }}>CRITICAL</span>
        )}
        <span className="flex-1" />
        {pre.length > 0 && (
          <button onClick={() => setShowPre(v => !v)} className="text-xs underline cursor-pointer" style={{ color: 'var(--primary)' }}>
            {showPre ? 'Hide' : `Show ${pre.length} pre-existing`}
          </button>
        )}
        <button onClick={rerun} disabled={running} className="text-xs font-semibold cursor-pointer disabled:opacity-60" style={{ color: 'var(--text-muted)' }}>
          {running ? 'Checking…' : 'Re-check'}
        </button>
      </div>

      <div className="px-4 pb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        Deterministic checks over every session — locks that never became a draft, cut-off
        replies, writing piling up where it will not assemble. No model judgement: these are
        facts about whether the work survived.
      </div>

      {shown.length > 0 && (
        <div className="px-4 pb-4 space-y-2">
          {shown.map(f => {
            const tone = HEALTH_TONE[f.severity] ?? HEALTH_TONE.medium
            const sess = sessionById?.[f.session_id]
            const who = profileById?.[sess?.student_id]?.full_name
            return (
              <div key={`${f.session_id}:${f.signal}`} className="rounded-xl px-3 py-2 text-xs"
                style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', opacity: f.pre_existing ? 0.7 : 1 }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: tone.bg, color: tone.fg }}>{tone.word}</span>
                  <span className="font-bold" style={{ color: 'var(--text-strong)' }}>{HEALTH_SIGNAL_LABEL[f.signal] ?? f.signal}</span>
                  {f.pre_existing && (
                    <span className="text-[10px] rounded-full px-2 py-0.5" style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-subtle)' }}>pre-existing</span>
                  )}
                  <span className="flex-1" />
                  <button onClick={() => acknowledge(f, true)} className="text-[10px] font-semibold px-2 py-1 rounded-full cursor-pointer"
                    style={{ border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>Acknowledge</button>
                </div>
                <p className="mt-1" style={{ color: 'var(--text-strong)' }}>
                  {who ? `${who} · ` : ''}{sess?.title || 'Untitled session'}
                </p>
                <p style={{ color: 'var(--text-muted)' }}>{f.detail}</p>
                <a href={`/transcript/${f.session_id}`} className="underline mt-1 inline-block" style={{ color: 'var(--primary)' }}>
                  Open session →
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AuditTab({ sessionById, profileById, focusSessionId, onFocusHandled }) {
  const [state, setState] = useState({ loading: true, findings: [], runs: [], breachReviews: {}, error: '' })
  const [running, setRunning] = useState(false)
  const [count, setCount] = useState(10)
  const [showResolved, setShowResolved] = useState(false)
  // The jump arrives from another tab, but findings load by fetch — so the target
  // row does not exist at click time. Scroll AFTER the list renders, and only once.
  const focusRef = useRef(null)
  useEffect(() => {
    if (!focusSessionId || state.loading || !focusRef.current) return
    focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => onFocusHandled?.(), 2500)
    return () => clearTimeout(t)
  }, [focusSessionId, state.loading, onFocusHandled])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/audit-findings')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setState({ loading: false, findings: [], runs: [], breachReviews: {}, error: json.error ?? 'Failed to load findings.' }); return }
      setState({ loading: false, findings: json.findings ?? [], runs: json.runs ?? [], breachReviews: json.breachReviews ?? {}, error: '' })
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
      {/* Student work at risk — deliberately ABOVE and visually apart from the judge
          findings. These are mechanical: did the writing survive? Not "could the
          coaching be better". They must not read as the same kind of item. */}
      <SessionHealthPanel sessionById={sessionById} profileById={profileById} />
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
            <div key={f.id} ref={f.session_id === focusSessionId ? focusRef : null}
              className="rounded-2xl transition-shadow"
              style={f.session_id === focusSessionId
                ? { boxShadow: '0 0 0 2px var(--accent)' }
                : undefined}>
              <AuditFindingCard finding={f}
                session={sessionById[f.session_id]}
                student={profileById[f.student_id]}
                breachReviews={state.breachReviews?.[f.id]}
                onChanged={load} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Per-assignment warnings + the jump-to-audit action, via context so SessionRow
// doesn't need them threaded through five different call sites.
const AuditJumpContext = createContext({ warnings: {}, jumpToAudit: null })

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
  // Warnings for THIS assignment. The roster's student-level count says someone has
  // a finding; this says which piece of work it is on, and clicking it goes there.
  const { warnings, jumpToAudit } = useContext(AuditJumpContext)
  const warn = warnings?.[session.id] ?? null
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
    // The row is a flex WRAPPER, not one big button: the warnings chip is its own
    // control, and an interactive element cannot legally nest inside a <button>.
    <div className="w-full flex items-center gap-2 rounded-xl transition group"
      style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.backgroundColor = 'var(--surface-spark)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.backgroundColor = 'var(--surface-card)' }}>

    {warn?.total > 0 && (
      <button
        onClick={() => jumpToAudit?.(session.id)}
        title={`${warn.total} open guardrail-audit finding${warn.total === 1 ? '' : 's'} on this assignment${warn.high ? ` · ${warn.high} high` : ''} — open it in the Audit tab`}
        aria-label={`${warn.total} audit finding${warn.total === 1 ? '' : 's'} — show in Audit tab`}
        className="ml-3 shrink-0 text-[11px] font-bold tabular-nums rounded-full px-2 py-0.5 hover:opacity-80 transition"
        style={warn.high > 0
          ? { backgroundColor: 'var(--status-error-bg)', color: 'var(--status-error)' }
          : { backgroundColor: 'var(--status-thin-bg)', color: 'var(--status-thin)' }}>
        {warn.total}
      </button>
    )}

    <button onClick={open} disabled={loading}
      className="flex-1 min-w-0 text-left flex items-center gap-3 px-4 py-3 disabled:opacity-60 bg-transparent">

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
          style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--text-link)' }}>
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
    </div>
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
          <OnboardingBadge userId={person.id} complete={person.onboarding_complete === true}
            practiced={person.practiced === true} />
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

// Column header for the student roster — glyphs only, sitting directly above the
// numbers they label. The legend under the roster spells them out, so the rows
// themselves stay free of repeated words ("3 assignments · 2 completed · …").
// One glyph column header, with a hover label that actually appears.
// The native `title` attribute was doing this job and doing it badly: the browser
// waits about a second, renders it in OS chrome, and gives no hint it exists — so a
// glyph-only header read as unlabelled. This is a CSS-only tooltip (no JS, no state)
// that shows immediately on hover AND on keyboard focus, with `title` kept as the
// fallback for anything that can't hover.
function ColHeader({ Icon, label, hint }) {
  return (
    <span className={`${COL_HEAD} relative group`} tabIndex={0} title={hint} aria-label={label}>
      <Icon />
      <span role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus:opacity-100 motion-reduce:transition-none"
        // The header is uppercase + widely tracked; the tooltip must NOT inherit that
        // or it reads as another heading rather than an explanation.
        style={{ backgroundColor: 'var(--surface-ink)', color: 'var(--text-on-dark)',
                 font: 'var(--type-meta)', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400 }}>
        {hint}
      </span>
    </span>
  )
}

function StudentRosterHeader() {
  return (
    <div className="flex items-center gap-4 px-5 pb-2 text-[10px] font-bold uppercase tracking-widest"
      style={{ color: 'var(--text-subtle)', borderBottom: '1px solid var(--border-default)' }}>
      <span className="flex-1 min-w-0">Student info</span>
      <ColHeader Icon={IconEyeSm}   label="Last seen"   hint="Last seen — most recent sign-in" />
      <ColHeader Icon={IconLogins}  label="Logins"      hint="Logins — counted from 2026-08-08 onward" />
      <ColHeader Icon={IconDoc}     label="Assignments" hint="Assignments — real work, excluding the practice warm-up" />
      <ColHeader Icon={IconCheck}   label="Completed"   hint="Completed — assignments the student finished" />
      <ColHeader Icon={IconWarnTri} label="Warnings"    hint="Warnings — open guardrail-audit findings" />
      <span className="w-4 shrink-0" aria-hidden />
    </div>
  )
}

// Legend — names every glyph used above, so nothing in the roster relies on the
// reader already knowing what a dotted circle means.
function StudentRosterLegend() {
  const item = (Glyph, label, color) => (
    <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
      <span style={{ color }}><Glyph /></span>{label}
    </span>
  )
  return (
    <div className="flex items-center gap-5 flex-wrap px-5 pt-3 text-xs"
      style={{ borderTop: '1px solid var(--border-default)' }}>
      {item(IconCheck, 'Practiced', 'var(--status-success)')}
      {item(IconNotOnb, 'Not onboarded', 'var(--text-subtle)')}
      {item(IconSkipped, 'Skipped', 'var(--status-thin)')}
      <span className="flex-1" />
      {item(IconEyeSm, 'Last seen', 'var(--text-subtle)')}
      {item(IconLogins, 'Logins', 'var(--text-subtle)')}
      {item(IconDoc, 'Assignments', 'var(--text-subtle)')}
      {item(IconCheck, 'Completed', 'var(--text-subtle)')}
      {item(IconWarnTri, 'Warnings', 'var(--text-subtle)')}
    </div>
  )
}

// Student card. The collapsed row is identity + five aligned numbers, nothing else:
// the FTUE state is a glyph before the name, and Remote in / Delete live INSIDE the
// expanded body rather than crowding every row with buttons that are rarely used.
function StudentCard({ student, sessions, onRoleChanged, children }) {
  const [open, setOpen] = useState(false)
  // ALWAYS expandable. This was `sessions.length > 0`, which hid the chevron on a
  // student with no work — and since Remote in / Delete account moved into the body,
  // that made those accounts unreachable from the UI. The accounts most likely to need
  // deleting (a stranded signup, a demo left behind, a test account) are exactly the
  // ones with nothing in them, so gating admin actions on having work is backwards.
  const hasBody = true
  const toggle = () => setOpen(o => !o)

  // An "assignment" is real work (the FTUE warm-up is excluded), so a student who has
  // only done the warm-up correctly reads as 0 assignments.
  const assignments = sessions.filter(s => !s.is_onboarding)
  const completed = assignments.filter(s => s.status === 'complete').length
  const warn = student.audit_warnings
  // Logins are counted from migration 059 onward — Supabase keeps no lifetime count
  // and the auth schema can't be read back, so pre-059 history is genuinely unknown.
  // Show "—" rather than "0 logins", which would assert something we don't know.
  const logins = Number.isFinite(student.login_count) ? student.login_count : null
  const active = isActiveNow(student.last_seen_at)

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', boxShadow: 'var(--shadow-xs)' }}>

      <div className="px-5 py-3 flex items-center gap-4">

        {/* Avatar — spans both rows (COPPA: Avatar hard-suppresses under-13 to initials) */}
        <div className="shrink-0">
          <Avatar name={student.full_name} avatarUrl={student.avatar_url} ageBracket={student.age_bracket} size={52} />
        </div>

        {/* Identity — name row over email */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Name first, flush left — the FTUE glyph trails the pills so the email on the
                row below lines up with the name instead of needing an indent to match it. */}
            <button className="min-w-0 text-left disabled:cursor-default" onClick={toggle} disabled={!hasBody}>
              <span className="text-sm font-semibold truncate block" style={{ color: 'var(--text-strong)' }}>
                {student.full_name ?? '—'}
              </span>
            </button>
            <RoleEditor userId={student.id} currentRole={student.role} onChanged={onRoleChanged} />
            <AgeBadge ageBracket={student.age_bracket} consentGiven={student.coppa_consent_given} />
            <OnboardingIcon userId={student.id} complete={student.onboarding_complete === true}
              practiced={student.practiced === true} />
          </div>
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}
            title={`Joined ${formatDate(student.created_at)}`}>
            {student.email}
          </p>
        </div>

        {/* Aligned numbers — one per header glyph. A dash means "none", and for logins
            specifically it means "not recorded", which is not the same as zero. */}
        <span className={`${COL} text-xs`}
          style={{ color: active ? 'var(--status-success)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}
          title={student.last_seen_at
            ? `Last seen ${formatDate(student.last_seen_at)}${student.last_sign_in_at && student.last_sign_in_at !== student.last_seen_at ? ` · last signed in ${formatDate(student.last_sign_in_at)}` : ''}`
            : 'Never seen'}>
          {active && <span aria-hidden style={{ marginRight: 4 }}>●</span>}
          {presenceLabel(student.last_seen_at)}
        </span>
        <span className={`${COL} text-xs`} style={{ color: logins ? 'var(--text-muted)' : 'var(--text-subtle)' }}
          title={logins ? 'Sign-ins recorded since 2026-08-08' : 'Logins are counted from 2026-08-08 onward — earlier sign-ins were never recorded'}>
          {logins ?? '—'}
        </span>
        <span className={`${COL} text-xs`} style={{ color: assignments.length ? 'var(--text-muted)' : 'var(--text-subtle)' }} title="Assignments">
          {assignments.length}
        </span>
        <span className={`${COL} text-xs`} style={{ color: completed > 0 ? 'var(--status-success)' : 'var(--text-subtle)' }} title="Completed">
          {completed}
        </span>
        <span className={`${COL} text-xs font-semibold`}
          title={warn?.total ? `${warn.total} open guardrail-audit finding${warn.total === 1 ? '' : 's'}${warn.high ? ` · ${warn.high} high` : ''}` : 'No open warnings'}
          style={{ color: !warn?.total ? 'var(--text-subtle)' : warn.high > 0 ? 'var(--status-error)' : 'var(--status-thin)' }}>
          {warn?.total || '—'}
        </span>

        {/* Expand — one control at the right edge, no label */}
        <button onClick={toggle} disabled={!hasBody}
          className="w-4 shrink-0 flex items-center justify-center transition-transform disabled:opacity-25 cursor-pointer disabled:cursor-default"
          style={{ color: 'var(--text-subtle)', transform: open ? 'rotate(90deg)' : 'none' }}
          aria-expanded={open}
          aria-label={open ? 'Collapse account details' : 'Expand account details'}>
          <IconChevron />
        </button>
      </div>

      {hasBody && open && (
        <div className="px-5 pb-4 pt-3 space-y-2" style={{ borderTop: '1px solid var(--border-default)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-subtle)' }}>
            Assignments
          </p>
          {assignments.length === 0
            ? <p className="text-xs italic" style={{ color: 'var(--text-subtle)' }}>No assignments yet.</p>
            : children}
          {/* Account actions live here, not on the collapsed row — they're occasional,
              and putting them on every row is what made the roster feel crowded. */}
          <div className="flex items-center justify-between gap-3 pt-3"
            style={{ borderTop: '1px solid var(--border-default)' }}>
            <RemoteInButton userId={student.id} />
            <DeleteUserButton userId={student.id} name={student.full_name} />
          </div>
        </div>
      )}
    </div>
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
    <p className="text-sm text-center py-12" style={{ color: 'var(--status-error)' }}>Failed to load: {error}</p>
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
                    backgroundColor: elDanger ? 'var(--status-error)' : elPct > 60 ? 'var(--status-thin)' : 'var(--status-success)',
                  }}
                />
              </div>
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>{elevenlabs.characterCount.toLocaleString()} used</span>
                <span style={{ color: elDanger ? 'var(--status-error)' : undefined, fontWeight: elDanger ? 700 : undefined }}>
                  {elRemaining.toLocaleString()} remaining of {elevenlabs.characterLimit.toLocaleString()}
                </span>
              </div>
            </div>
            {elDanger && (
              <p className="text-xs font-semibold rounded-lg px-3 py-2 inline-flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--status-error-bg)', color: 'var(--status-error)' }}>
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

            {/* Deleted / unattributed — real product spend (category='user') whose
                user_id was nulled on delete (migration 013). Testing/sim spend also has
                a null user but is EXCLUDED here (it lives in the Cost-by-Bucket card);
                the route scopes this to category='user'. Reconciles the per-user rows. */}
            {unattributed && (
              <div className="flex items-center gap-3 text-xs py-1.5"
                style={{ borderTop: '1px dashed var(--border-default)' }}>
                <span className="flex-1 min-w-0">
                  <span className="font-semibold block truncate italic" style={{ color: 'var(--text-muted)' }}>Deleted / unattributed</span>
                  <span className="block truncate" style={{ color: 'var(--text-subtle)' }}>
                    {unattributed.rowCount} orphaned row{unattributed.rowCount !== 1 ? 's' : ''} — deleted/unattributed users, no PII (testing excluded)
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
// ── Beta Circle counter — how many of the 100 locked-rate STUDENT slots are used ──
// Counts profiles.is_beta_circle (students only; parents/teachers/demo never count —
// see lib/access.js + migration 046). Read-only; the flag is granted server-side on
// code redemption / invite-accept / consent.
const BETA_CIRCLE_CAP = 100
// ── Beta Circle management panel (Tools tab) ──────────────────
// Upgrades the old read-only count card into a live manager. Fetches GET
// /api/admin/beta-circle on mount, owns its own state, and re-paints from the
// authoritative payload every mutation returns — so count + lists stay in sync.
// The server route (requireAdmin, service role) is the trust boundary; this is UI.
// `initialCount` is only an instant-paint fallback until the fetch resolves.

function personLabel(p) {
  return p.full_name || p.email || 'Unnamed student'
}

// Access-code redemption ceiling (migration 049). max_uses NULL = unlimited, which
// is every pre-049 code — so "∞" is the normal, expected reading here, and a number
// means someone deliberately capped it. `exhausted` is what actually stops new
// redemptions (the server enforces it atomically; this is only the readout).
function codeUsage(c) {
  const uses = c.uses ?? 0
  const max = typeof c.max_uses === 'number' ? c.max_uses : null
  return {
    uses,
    max,
    label: max === null ? `${uses} / ∞` : `${uses} / ${max}`,
    exhausted: max !== null && uses >= max,
  }
}

function BetaCircleManager({ initialCount = 0 }) {
  const [state, setState] = useState({ count: initialCount, cap: BETA_CIRCLE_CAP, members: [], candidates: [], codes: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')      // transient success/deny message
  const [busyKey, setBusyKey] = useState('')     // which control is mid-flight
  const [confirmId, setConfirmId] = useState('') // member pending remove-confirm
  const [pick, setPick] = useState('')           // selected candidate id in the Add picker
  const [newCode, setNewCode] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newMaxUses, setNewMaxUses] = useState('')   // blank = unlimited
  const [limitDrafts, setLimitDrafts] = useState({}) // per-code in-progress limit edits

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/beta-circle')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Could not load the Beta Circle.'); setLoading(false); return }
      setState({ count: json.count, cap: json.cap, members: json.members, candidates: json.candidates, codes: json.codes })
    } catch { setError('Network error loading the Beta Circle.') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Every mutation returns the fresh GET-shape payload; adopt it so count + lists
  // stay live without a second round-trip. Returns the parsed json for callers that
  // need to inspect ok/reason.
  async function mutate(key, payload) {
    setBusyKey(key); setError(''); setNotice('')
    try {
      const res = await fetch('/api/admin/beta-circle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Request failed.'); return json }
      if (json.count != null) {
        setState({ count: json.count, cap: json.cap, members: json.members, candidates: json.candidates, codes: json.codes })
      }
      return json
    } catch {
      setError('Network error.'); return {}
    } finally {
      setBusyKey('')
    }
  }

  const { count, cap, members, candidates, codes } = state
  const pct = Math.min(100, Math.round((count / cap) * 100))
  const remaining = Math.max(0, cap - count)
  const atCap = count >= cap

  async function addMember() {
    if (!pick) return
    const json = await mutate('add', { action: 'add_member', userId: pick })
    if (json.ok) { setNotice('Student added to the Beta Circle.'); setPick('') }
    else if (json.reason === 'cap_reached') setError('Cap reached — free a slot first.')
    else if (json.reason === 'not_student') setError('That account is not a student, so it never takes a slot.')
  }

  async function removeMember(id) {
    setConfirmId('')
    const json = await mutate(`remove:${id}`, { action: 'remove_member', userId: id })
    if (json.ok) setNotice('Student removed — a slot is now free.')
  }

  async function toggleCode(code, active) {
    await mutate(`code:${code}`, { action: 'toggle_code', code, active })
  }

  async function createCode() {
    const code = newCode.trim().toLowerCase()
    if (!code) { setError('Enter a code.'); return }
    const json = await mutate('createcode', {
      action: 'create_code', code, label: newLabel.trim(), grantsBetaCircle: true,
      maxUses: newMaxUses,  // blank string = unlimited; the server validates
    })
    if (json.ok) { setNotice(`Code “${code}” created.`); setNewCode(''); setNewLabel(''); setNewMaxUses('') }
  }

  // Set or clear a code's redemption ceiling. Blank = unlimited. A limit at or below
  // the current uses instantly exhausts the code — that's a legitimate way to stop a
  // leaked code without deactivating it, so we just say so plainly.
  async function setCodeLimit(code, raw) {
    const json = await mutate(`limit:${code}`, { action: 'set_code_limit', code, maxUses: raw })
    if (json.ok) {
      setLimitDrafts(d => { const next = { ...d }; delete next[code]; return next })
      const n = String(raw ?? '').trim()
      setNotice(n === '' ? `“${code}” is now unlimited.` : `“${code}” is capped at ${n} redemption${n === '1' ? '' : 's'}.`)
    }
  }

  const cardStyle = { background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' }
  const sectionLabel = { font: 'var(--type-meta)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', margin: '0 0 var(--space-2)' }
  const rowStyle = { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }

  return (
    <div style={cardStyle}>
      {/* Header + progress (kept from the old card) */}
      <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-2)', gap: 'var(--space-3)' }}>
        <div>
          <h3 style={{ font: 'var(--type-heading)', color: 'var(--text-strong)', margin: 0 }}>Beta Circle</h3>
          <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Locked-rate student slots · manage members &amp; access codes
          </p>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <span style={{ font: 'var(--type-title)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
          <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}> / {cap}</span>
        </div>
      </div>
      <div role="progressbar" aria-valuenow={count} aria-valuemin={0} aria-valuemax={cap} aria-label="Beta Circle slots used"
        style={{ height: 8, borderRadius: 'var(--radius-pill)', background: 'var(--surface-sunken)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 'var(--radius-pill)', transition: 'width .3s ease' }} />
      </div>
      <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: 'var(--space-2) 0 0' }}>
        {remaining > 0 ? `${remaining} slot${remaining === 1 ? '' : 's'} left` : 'Cap reached — new students get access but not the locked rate'}
      </p>

      {/* Live status line */}
      {error && <p role="alert" style={{ font: 'var(--type-meta)', color: 'var(--status-error)', margin: 'var(--space-3) 0 0' }}>{error}</p>}
      {notice && !error && <p role="status" style={{ font: 'var(--type-meta)', color: 'var(--status-success)', margin: 'var(--space-3) 0 0' }}>{notice}</p>}

      {loading && members.length === 0 && codes.length === 0 ? (
        <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: 'var(--space-4) 0 0' }}>Loading…</p>
      ) : (
        <>
          {/* ── Members ─────────────────────────────────────────── */}
          <div style={{ marginTop: 'var(--space-5)' }}>
            <p style={sectionLabel}>Members ({members.length})</p>
            {members.length === 0 ? (
              <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: 0 }}>No students in the circle yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {members.map(m => (
                  <li key={m.id} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ font: 'var(--type-body)', color: 'var(--text-strong)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{personLabel(m)}</p>
                      <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.email || '—'} · joined {formatDate(m.created_at)}
                      </p>
                    </div>
                    {confirmId === m.id ? (
                      <div className="flex items-center" style={{ gap: 'var(--space-2)', flexShrink: 0 }}>
                        <button onClick={() => removeMember(m.id)} disabled={busyKey === `remove:${m.id}`}
                          className="disabled:opacity-60"
                          style={{ font: 'var(--type-meta)', fontWeight: 700, color: 'var(--text-on-accent)', background: 'var(--status-error)', border: 'none', borderRadius: 'var(--radius-pill)', padding: '8px 14px', minHeight: 44, cursor: 'pointer' }}>
                          {busyKey === `remove:${m.id}` ? '…' : 'Confirm remove'}
                        </button>
                        <button onClick={() => setConfirmId('')} disabled={busyKey === `remove:${m.id}`}
                          style={{ font: 'var(--type-meta)', fontWeight: 600, color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-pill)', padding: '8px 12px', minHeight: 44, cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setConfirmId(m.id); setNotice(''); setError('') }} disabled={!!busyKey}
                        aria-label={`Remove ${personLabel(m)} from the Beta Circle`}
                        className="disabled:opacity-60"
                        style={{ font: 'var(--type-meta)', fontWeight: 600, color: 'var(--status-error)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-pill)', padding: '8px 14px', minHeight: 44, cursor: 'pointer', flexShrink: 0 }}>
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Add a student ───────────────────────────────────── */}
          <div style={{ marginTop: 'var(--space-5)' }}>
            <p style={sectionLabel}>Add a student</p>
            {atCap ? (
              <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: 0 }}>Cap reached — free a slot first to add another student.</p>
            ) : candidates.length === 0 ? (
              <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: 0 }}>Every student is already in the circle.</p>
            ) : (
              <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
                <label htmlFor="bc-add-pick" className="sr-only">Choose a student to add</label>
                <select id="bc-add-pick" value={pick} onChange={e => setPick(e.target.value)} disabled={busyKey === 'add'}
                  style={{ flex: '1 1 240px', minWidth: 0, minHeight: 44, font: 'var(--type-body)', color: 'var(--text-strong)', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '0 var(--space-3)' }}>
                  <option value="">Select a student…</option>
                  {candidates.map(c => (
                    <option key={c.id} value={c.id}>{personLabel(c)}{c.email ? ` · ${c.email}` : ''}</option>
                  ))}
                </select>
                <button onClick={addMember} disabled={!pick || busyKey === 'add'}
                  className="disabled:opacity-60"
                  style={{ font: 'var(--type-body)', fontWeight: 700, color: 'var(--text-on-accent)', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-pill)', padding: '0 var(--space-4)', minHeight: 44, cursor: 'pointer', flexShrink: 0 }}>
                  {busyKey === 'add' ? 'Adding…' : 'Add'}
                </button>
              </div>
            )}
          </div>

          {/* ── Access codes ────────────────────────────────────── */}
          <div style={{ marginTop: 'var(--space-5)' }}>
            <p style={sectionLabel}>Access codes</p>
            {codes.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '0 0 var(--space-3)', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {codes.map(c => {
                  const u = codeUsage(c)
                  const draft = limitDrafts[c.code] ?? (u.max === null ? '' : String(u.max))
                  const dirty = draft !== (u.max === null ? '' : String(u.max))
                  const busy = busyKey === `limit:${c.code}`
                  return (
                  <li key={c.code} style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-2)' }}>
                    <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
                          <code style={{ fontFamily: 'monospace', font: 'var(--type-body)', color: 'var(--accent-text)' }}>{c.code}</code>
                          {u.exhausted && (
                            <span style={{ font: 'var(--type-meta)', fontWeight: 700, color: 'var(--status-thin)', background: 'var(--status-thin-bg)', border: '1px solid var(--status-thin)', borderRadius: 'var(--radius-pill)', padding: '1px 8px' }}>
                              Exhausted
                            </span>
                          )}
                        </div>
                        <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: 0 }}>
                          {c.label ? `${c.label} · ` : ''}
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: u.max === null ? 400 : 700, color: u.exhausted ? 'var(--status-thin)' : 'inherit' }}>{u.label}</span>
                          {' used'}{c.grants_beta_circle ? ' · grants slot' : ' · access only'}
                        </p>
                      </div>
                      <button onClick={() => toggleCode(c.code, !c.active)} disabled={busyKey === `code:${c.code}`}
                        role="switch" aria-checked={c.active}
                        aria-label={`${c.active ? 'Deactivate' : 'Activate'} code ${c.code}`}
                        className="disabled:opacity-60"
                        style={{ font: 'var(--type-meta)', fontWeight: 700, minHeight: 44, padding: '8px 14px', borderRadius: 'var(--radius-pill)', cursor: 'pointer', flexShrink: 0,
                          color: c.active ? 'var(--status-success)' : 'var(--text-muted)',
                          background: c.active ? 'var(--status-success-bg)' : 'var(--surface-muted)',
                          border: `1px solid ${c.active ? 'var(--status-success)' : 'var(--border-default)'}` }}>
                        {busyKey === `code:${c.code}` ? '…' : c.active ? 'Active' : 'Inactive'}
                      </button>
                    </div>

                    {/* Redemption ceiling — blank = unlimited. This is how a leaked
                        code gets capped without rotating it. */}
                    <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
                      <label htmlFor={`bc-limit-${c.code}`} style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', flexShrink: 0 }}>Limit</label>
                      <input id={`bc-limit-${c.code}`} value={draft} disabled={busy}
                        onChange={e => setLimitDrafts(d => ({ ...d, [c.code]: e.target.value }))}
                        inputMode="numeric" placeholder="unlimited"
                        aria-describedby={`bc-limit-help-${c.code}`}
                        style={{ width: 110, minHeight: 44, font: 'var(--type-meta)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-strong)', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '0 var(--space-2)' }} />
                      <button onClick={() => setCodeLimit(c.code, draft)} disabled={busy || !dirty}
                        className="disabled:opacity-60"
                        style={{ font: 'var(--type-meta)', fontWeight: 700, color: 'var(--text-strong)', background: 'var(--surface-muted)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-pill)', minHeight: 44, padding: '0 var(--space-3)', cursor: dirty && !busy ? 'pointer' : 'default', flexShrink: 0 }}>
                        {busy ? '…' : 'Save limit'}
                      </button>
                      {u.max !== null && (
                        <button onClick={() => setCodeLimit(c.code, '')} disabled={busy}
                          className="disabled:opacity-60"
                          style={{ font: 'var(--type-meta)', fontWeight: 600, color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-pill)', minHeight: 44, padding: '0 var(--space-3)', cursor: 'pointer', flexShrink: 0 }}>
                          Clear
                        </button>
                      )}
                      <span id={`bc-limit-help-${c.code}`} style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)' }}>
                        {u.exhausted
                          ? 'Fully claimed — no new redemptions.'
                          : u.max === null
                            ? 'Blank = unlimited redemptions.'
                            : `${u.max - u.uses} redemption${u.max - u.uses === 1 ? '' : 's'} left.`}
                      </span>
                    </div>
                  </li>
                  )
                })}
              </ul>
            )}
            {/* Create code row */}
            <div className="flex flex-wrap items-center" style={{ gap: 'var(--space-2)' }}>
              <label htmlFor="bc-new-code" className="sr-only">New code</label>
              <input id="bc-new-code" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="new-code"
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                style={{ flex: '1 1 140px', minWidth: 0, minHeight: 44, fontFamily: 'monospace', font: 'var(--type-body)', color: 'var(--text-strong)', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '0 var(--space-3)' }} />
              <label htmlFor="bc-new-label" className="sr-only">Label (optional)</label>
              <input id="bc-new-label" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label (optional)"
                style={{ flex: '2 1 180px', minWidth: 0, minHeight: 44, font: 'var(--type-body)', color: 'var(--text-strong)', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '0 var(--space-3)' }} />
              <label htmlFor="bc-new-max" className="sr-only">Redemption limit (optional)</label>
              <input id="bc-new-max" value={newMaxUses} onChange={e => setNewMaxUses(e.target.value)} placeholder="Limit"
                inputMode="numeric"
                style={{ flex: '0 0 100px', minWidth: 0, minHeight: 44, font: 'var(--type-body)', fontVariantNumeric: 'tabular-nums', color: 'var(--text-strong)', background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '0 var(--space-3)' }} />
              <button onClick={createCode} disabled={busyKey === 'createcode' || !newCode.trim()}
                className="disabled:opacity-60"
                style={{ font: 'var(--type-body)', fontWeight: 700, color: 'var(--text-strong)', background: 'var(--surface-muted)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-pill)', padding: '0 var(--space-4)', minHeight: 44, cursor: 'pointer', flexShrink: 0 }}>
                {busyKey === 'createcode' ? 'Creating…' : 'Create code'}
              </button>
            </div>
            <p style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', margin: 'var(--space-2) 0 0' }}>
              New codes grant a Beta Circle slot and go live immediately. Leave <em>Limit</em> blank for unlimited
              redemptions, or set a number to cap how many people a code can let in. Deactivating a code pauses new
              redemptions; an exhausted code stops granting access but stays valid-looking.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// ── Tools tab — admin utilities kept out of the main flow ──────
// Demo persona seeder + idempotent maintenance backfills. Lives behind the Tools
// tab so it doesn't consume prime real estate above the roster.
// ── Waitlist ────────────────────────────────────────────────────────────────────
// Who asked for access, and what actually happened to them.
//
// The badge counts people who have heard NOTHING — not rows. `subscribers` is a list
// of addresses typed into a form, and on 2026-08-16 two of its three rows belonged to
// people who had already signed up and redeemed a code. A card that counted rows would
// have shown 3 and sent invites to people who were already inside, so every row here is
// resolved against its real account server-side (lib/waitlist.js).
//
// "Stalled" is the other half: someone who got in and then wrote nothing is invisible
// everywhere else in the admin panel, because they no longer look like a queue.
function WaitlistManager() {
  const [state, setState] = useState({ items: [], counts: null, needsAction: 0, codes: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [code, setCode] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  // Separate from confirmEmail: "Forget" is a different, irreversible action and must
  // not share a confirm latch with Dismiss, or one click could arm the other.
  const [confirmForget, setConfirmForget] = useState('')
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/waitlist')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Could not load the waitlist.'); setLoading(false); return }
      setState(json)
      setCode(c => c || json.codes?.[0]?.code || '')
    } catch { setError('Network error loading the waitlist.') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function mutate(key, payload, successMsg) {
    setBusyKey(key); setError(''); setNotice('')
    try {
      const res = await fetch('/api/admin/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Request failed.'); return }
      setState(json)
      if (successMsg) setNotice(successMsg)
    } catch { setError('Network error.') }
    finally { setBusyKey('') }
  }

  const cardStyle = { background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' }
  const rowStyle = { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--surface-sunken)', flexWrap: 'wrap' }
  const pill = (bg, fg) => ({ font: 'var(--type-meta)', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap' })

  const STATE_PILL = {
    waiting:   pill('var(--accent-tint)', 'var(--accent-text)'),
    invited:   pill('var(--surface-sunken)', 'var(--text-muted)'),
    signed_up: pill('var(--surface-sunken)', 'var(--text-default)'),
    writing:   pill('var(--status-ok-tint, var(--surface-sunken))', 'var(--text-default)'),
    subscriber:pill('var(--surface-sunken)', 'var(--text-muted)'),
    dismissed: pill('var(--surface-sunken)', 'var(--text-muted)'),
  }
  const STATE_LABEL = { waiting: 'Waiting', invited: 'Code sent', signed_up: 'Signed up', writing: 'Writing', dismissed: 'Dismissed', subscriber: 'Blog' }

  const { items, counts, needsAction, codes } = state
  const visible = showAll ? items : items.filter(i => i.needsAction)
  const noCodes = !loading && (codes?.length ?? 0) === 0

  return (
    <div style={cardStyle}>
      <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-3)', gap: 'var(--space-3)' }}>
        <div>
          <h3 style={{ font: 'var(--type-heading)', color: 'var(--text-strong)', margin: 0 }}>
            Waitlist
            {needsAction > 0 && (
              <span style={{ ...pill('var(--accent)', 'var(--text-on-accent)'), marginLeft: 8 }}>{needsAction}</span>
            )}
          </h3>
          <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {counts
              ? `${counts.waiting} waiting · ${counts.invited} code sent · ${counts.signed_up + counts.writing} signed up${counts.subscriber ? ` · ${counts.subscriber} blog` : ''}`
              : 'Access requests from the site'}
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          style={{ font: 'var(--type-meta)', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'underline', minHeight: 44, padding: '0 8px' }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <p role="alert" style={{ font: 'var(--type-meta)', color: 'var(--status-error)', margin: '0 0 var(--space-2)' }}>{error}</p>}
      {notice && <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '0 0 var(--space-2)' }}>{notice}</p>}

      {/* Which code the Send button will mail. Only ACTIVE, non-exhausted codes are
          offered — an exhausted code would be worse than sending nothing. */}
      <div className="flex items-center" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
        <label htmlFor="wl-code" style={{ font: 'var(--type-meta)', color: 'var(--text-muted)' }}>Send code:</label>
        <select id="wl-code" value={code} onChange={e => setCode(e.target.value)} disabled={noCodes}
          style={{ font: 'var(--type-body)', padding: '6px 10px', minHeight: 44, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--surface-card)', color: 'var(--text-default)' }}>
          {codes?.map(c => (
            <option key={c.code} value={c.code}>
              {c.code}{c.max_uses != null ? ` (${c.uses ?? 0}/${c.max_uses})` : ''}
            </option>
          ))}
        </select>
        {noCodes && (
          <span style={{ font: 'var(--type-meta)', color: 'var(--status-error)' }}>
            No active code with room — create or raise one in Beta Circle first.
          </span>
        )}
      </div>

      {loading ? (
        <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: 0 }}>Loading…</p>
      ) : visible.length === 0 ? (
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', margin: 0 }}>
          {items.length === 0 ? 'Nobody has requested access yet.' : 'Nobody is waiting — everyone has been answered.'}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map(i => (
            <div key={i.email} style={rowStyle}>
              <span style={STATE_PILL[i.state]}>{STATE_LABEL[i.state]}</span>
              <span style={{ font: 'var(--type-body)', color: 'var(--text-default)', flex: '1 1 220px', minWidth: 0, overflowWrap: 'anywhere' }}>
                {i.email}
                {i.account?.fullName && (
                  <span style={{ color: 'var(--text-muted)' }}> · {i.account.fullName} ({i.account.role})</span>
                )}
                {i.source && i.source !== 'waitlist' && (
                  <span style={{ color: 'var(--text-muted)' }}> · via {i.source}</span>
                )}
              </span>
              <span style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {i.state === 'waiting'
                  ? `${i.daysWaiting}d waiting`
                  : i.account?.stalled
                    ? 'signed up · nothing written'
                    : i.account
                      ? `${i.account.sessionCount} assignment${i.account.sessionCount === 1 ? '' : 's'}`
                      : i.invited_code ? `sent “${i.invited_code}”` : ''}
              </span>

              {i.needsAction && (
                <span className="flex items-center" style={{ gap: 'var(--space-2)' }}>
                  <button type="button" disabled={!code || busyKey === `send:${i.email}`}
                    onClick={() => mutate(`send:${i.email}`, { action: 'send_code', email: i.email, code }, `Code sent to ${i.email}.`)}
                    style={{ font: 'var(--type-meta)', fontWeight: 700, background: 'var(--accent)', color: 'var(--text-on-accent)', borderRadius: 'var(--radius-md)', padding: '0 14px', minHeight: 44 }}>
                    {busyKey === `send:${i.email}` ? 'Sending…' : 'Approve & send'}
                  </button>
                  {confirmEmail === i.email ? (
                    <button type="button"
                      onClick={() => { setConfirmEmail(''); mutate(`dismiss:${i.email}`, { action: 'dismiss', email: i.email }, 'Removed from the queue.') }}
                      style={{ font: 'var(--type-meta)', fontWeight: 700, color: 'var(--status-error)', textDecoration: 'underline', minHeight: 44, padding: '0 8px' }}>
                      Confirm
                    </button>
                  ) : (
                    <button type="button" onClick={() => setConfirmEmail(i.email)}
                      style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', textDecoration: 'underline', minHeight: 44, padding: '0 8px' }}>
                      Dismiss
                    </button>
                  )}
                </span>
              )}

              {/* Forget — for when the PERSON asks to be removed. The privacy policy
                  says "we delete it sooner if you ask us to", and until this existed
                  the only implementation was running SQL by hand. Shown on every row,
                  not just actionable ones: anyone can ask, at any state. Distinct from
                  Dismiss, which is our judgement and keeps the row 90 days. */}
              <span className="flex items-center" style={{ gap: 'var(--space-2)' }}>
                {confirmForget === i.email ? (
                  <button type="button" disabled={busyKey === `forget:${i.email}`}
                    onClick={() => { setConfirmForget(''); mutate(`forget:${i.email}`, { action: 'forget', email: i.email }, 'Deleted — they asked to be removed.') }}
                    style={{ font: 'var(--type-meta)', fontWeight: 700, color: 'var(--status-error)', textDecoration: 'underline', minHeight: 44, padding: '0 8px' }}>
                    {busyKey === `forget:${i.email}` ? 'Deleting…' : 'Confirm delete'}
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirmForget(i.email)}
                    title="They asked to be removed — deletes the address now, keeping nothing"
                    style={{ font: 'var(--type-meta)', color: 'var(--text-subtle)', textDecoration: 'underline', minHeight: 44, padding: '0 8px' }}>
                    Forget
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <button type="button" onClick={() => setShowAll(v => !v)}
          style={{ font: 'var(--type-meta)', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'underline', marginTop: 'var(--space-3)', minHeight: 44 }}>
          {showAll ? 'Show only people waiting' : `Show everyone (${items.length})`}
        </button>
      )}

      {counts?.stalled > 0 && (
        <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: 'var(--space-3) 0 0', lineHeight: 1.6 }}>
          {counts.stalled} {counts.stalled === 1 ? 'person' : 'people'} got in and {counts.stalled === 1 ? 'has' : 'have'} written nothing.
          They need a nudge, not an invite — sending a code would tell someone already inside to come inside.
        </p>
      )}
    </div>
  )
}

// ── Blog mailing ────────────────────────────────────────────────────────────────
// The blog form promised "we'll send new posts as they go up" from the day it shipped,
// and nothing sent one until 2026-08-16. Deliberately manual: pick a published post,
// see the real recipient count, send. Dry-run first because bulk mail is irreversible.
function BlogMailer() {
  const [state, setState] = useState({ posts: [], recipientCount: 0, skipped: {}, sends: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [slug, setSlug] = useState('')
  const [pending, setPending] = useState(null)   // dry-run result awaiting confirmation
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/blog-send')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Could not load the mailing state.'); setLoading(false); return }
      setState(json)
      setSlug(sl => sl || json.posts?.find(p => !p.sent)?.slug || '')
    } catch { setError('Network error.') }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function post(confirm) {
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/admin/blog-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, confirm }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Request failed.'); setPending(null); return }
      if (json.dryRun) { setPending(json); return }
      setNotice(`Sent "${json.title}" to ${json.sent} subscriber${json.sent === 1 ? '' : 's'}.${json.failed ? ` ${json.failed} failed.` : ''}`)
      setPending(null)
      load()
    } catch { setError('Network error.') }
    finally { setBusy(false) }
  }

  const cardStyle = { background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' }
  const unsent = state.posts?.filter(p => !p.sent) ?? []

  return (
    <div style={cardStyle}>
      <h3 style={{ font: 'var(--type-heading)', color: 'var(--text-strong)', margin: 0 }}>Blog mailing</h3>
      <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '2px 0 var(--space-3)' }}>
        {loading ? 'Loading…' : `${state.recipientCount} blog subscriber${state.recipientCount === 1 ? '' : 's'} · ${unsent.length} post${unsent.length === 1 ? '' : 's'} never mailed`}
      </p>

      {error && <p role="alert" style={{ font: 'var(--type-meta)', color: 'var(--status-error)', margin: '0 0 var(--space-2)' }}>{error}</p>}
      {notice && <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '0 0 var(--space-2)' }}>{notice}</p>}

      {state.recipientCount === 0 && !loading && (
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', margin: '0 0 var(--space-3)' }}>
          Nobody has signed up for posts yet. The form collects them at the bottom of /blog.
        </p>
      )}

      <div className="flex items-center" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <select value={slug} onChange={e => { setSlug(e.target.value); setPending(null) }}
          aria-label="Post to mail"
          style={{ font: 'var(--type-body)', padding: '6px 10px', minHeight: 44, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--surface-card)', color: 'var(--text-default)', maxWidth: '100%' }}>
          {state.posts?.map(p => (
            <option key={p.slug} value={p.slug} disabled={p.sent}>
              {p.sent ? '✓ ' : ''}{p.title}
            </option>
          ))}
        </select>
        <button type="button" disabled={!slug || busy || !state.recipientCount} onClick={() => post(false)}
          style={{ font: 'var(--type-meta)', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'underline', minHeight: 44, padding: '0 8px' }}>
          {busy && !pending ? 'Checking…' : 'Preview send'}
        </button>
      </div>

      {pending && (
        <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--surface-sunken)' }}>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-default)', margin: '0 0 var(--space-2)' }}>
            Send <strong>{pending.title}</strong> to <strong>{pending.recipientCount}</strong> subscriber{pending.recipientCount === 1 ? '' : 's'}?
          </p>
          <p style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', margin: '0 0 var(--space-3)' }}>
            This cannot be undone. Each email carries a one-click unsubscribe.
            {Object.keys(pending.skipped ?? {}).length > 0 &&
              ` Skipped: ${Object.entries(pending.skipped).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', ')}.`}
          </p>
          <button type="button" disabled={busy} onClick={() => post(true)}
            style={{ font: 'var(--type-meta)', fontWeight: 700, background: 'var(--accent)', color: 'var(--text-on-accent)', borderRadius: 'var(--radius-md)', padding: '0 14px', minHeight: 44 }}>
            {busy ? 'Sending…' : 'Send it'}
          </button>
          <button type="button" onClick={() => setPending(null)}
            style={{ font: 'var(--type-meta)', color: 'var(--text-muted)', textDecoration: 'underline', minHeight: 44, padding: '0 12px' }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function ToolsTab({ demoSeeded, betaCircleCount }) {
  return (
    <div className="space-y-4">
      <WaitlistManager />
      <BlogMailer />
      <BetaCircleManager initialCount={betaCircleCount} />
      <DemoDataControl seeded={demoSeeded} />
      <BackfillWritingProfiles />
      <BackfillGreetings />
    </div>
  )
}

// The four roster/session views are selected by the clickable stat tiles above,
// not the pill bar — the tiles ARE their tab buttons. Keep this list in sync with
// the tiles' tabId and the search-box visibility.
const LIST_TABS = ['students', 'parents', 'teachers', 'sessions']

export default function AdminDashboard({ currentUser, currentProfile, profiles, sessions, relationships, assignmentTeachers, sessionWarnings = {} }) {
  // Name the browser tab for this account ("BrainScribe — Elio" / "— ADMIN") so
  // several signed-in tabs are tellable apart. During a remote-in this profile is
  // already the impersonated user's, so the tab names whoever you're viewing.
  useTabTitle(currentProfile?.full_name, currentProfile?.role)
  const [tab, setTab] = useState('students')
  // Set when a per-assignment warning chip is clicked: switch to Audit and scroll to
  // that assignment's finding. Cleared once the Audit tab has acted on it, so
  // returning to the tab later doesn't re-scroll.
  const [auditFocus, setAuditFocus] = useState(null)
  const jumpToAudit = useCallback(sessionId => { setAuditFocus(sessionId); setTab('audit'); setSearch('') }, [])
  const [search, setSearch] = useState('')

  // Did this person actually FINISH a practice assignment? Derived from sessions because
  // the profile flag cannot answer it — onboarding_complete only means "don't route them
  // to /onboarding again", and both skip links set it. See OnboardingBadge.
  const practicedIds = new Set(
    (sessions ?? [])
      .filter(s => s.is_onboarding && s.status === 'complete')
      .map(s => s.student_id)
  )
  const withPracticed = p => ({ ...p, practiced: practicedIds.has(p.id) })

  const students = profiles.filter(p => p.role === 'student').map(withPracticed)
  const parents  = profiles.filter(p => p.role === 'parent').map(withPracticed)
  const teachers = profiles.filter(p => p.role === 'teacher').map(withPracticed)
  // Beta Circle = students holding the locked-rate flag (parents/teachers/demo never
  // count — enforced server-side; this is just the display total for the Tools card).
  const betaCircleCount = profiles.filter(p => p.is_beta_circle).length

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

  // Most recently active first — the students worth looking at are the ones who just
  // used it. Never-signed-in accounts sort last rather than pretending to be oldest.
  const filteredStudents = students
    .filter(s => !q || s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q))
    .sort((a, b) => {
      // last_seen_at, not last_sign_in_at: a user who never signs out keeps a stale
      // sign-in timestamp and would sort as inactive while actively writing.
      const at = a.last_seen_at ? new Date(a.last_seen_at).getTime() : -Infinity
      const bt = b.last_seen_at ? new Date(b.last_seen_at).getTime() : -Infinity
      return bt - at
    })
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

  // Students/Parents/Teachers/All Sessions are driven by the clickable stat tiles
  // above (no duplicate pill button). The pill bar carries only the views without
  // a tile.
  const TABS = [
    { id: 'audit',     label: 'Audit' },
    { id: 'usage',     label: 'Usage & Cost' },
    { id: 'tools',     label: 'Tools' },
  ]

  // Stat tiles double as the primary tab selectors — tabId maps a tile to its view.
  const STAT_TILES = [
    { label: 'Students',    tabId: 'students', value: students.length, Icon: IconStudents,    iconBg: 'var(--navy-100)',          iconColor: 'var(--navy-700)' },
    { label: 'Parents',     tabId: 'parents',  value: parents.length,  Icon: IconParents,     iconBg: 'var(--status-success-bg)', iconColor: 'var(--status-success)' },
    { label: 'Teachers',    tabId: 'teachers', value: teachers.length, Icon: IconTeachers,    iconBg: 'var(--surface-spark)',     iconColor: 'var(--accent)' },
    { label: 'Assignments', tabId: 'sessions', value: sessions.length, Icon: IconAssignments, iconBg: 'var(--primary-soft)',      iconColor: 'var(--text-link)' },
  ]

  const selectTab = t => { setTab(t); setSearch('') }

  const sessionById = Object.fromEntries(sessions.map(s => [s.id, s]))

  return (
    <AuditJumpContext.Provider value={{ warnings: sessionWarnings, jumpToAudit }}>
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>

      <Navbar user={currentUser} profile={currentProfile} />

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">

        {/* Draft integrity — surfaced first because this failure mode is silent by
            nature: the student sees a full working draft, the saved draft is short, and
            nothing else in the product notices. */}
        <DraftIntegrityAlert />

        {/* Stats double as the primary tab selectors — click a tile to open its
            list below (the tile IS its tab button; active tile = navy border). */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {STAT_TILES.map(s => {
            const isActive = tab === s.tabId
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => selectTab(s.tabId)}
                aria-pressed={isActive}
                aria-label={`Show ${s.label}`}
                className="rounded-2xl p-5 text-center transition cursor-pointer outline-none hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--primary)]"
                style={{
                  backgroundColor: 'var(--surface-card)',
                  border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border-default)'}`,
                  boxShadow: isActive ? 'var(--shadow-sm)' : 'var(--shadow-xs)',
                }}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2"
                  style={{ backgroundColor: s.iconBg, color: s.iconColor }}>
                  <s.Icon />
                </div>
                <p className="text-3xl font-black" style={{ color: 'var(--text-strong)' }}>{s.value}</p>
                <p className="text-xs mt-1" style={{ color: isActive ? 'var(--text-strong)' : 'var(--text-muted)' }}>{s.label}</p>
              </button>
            )
          })}
        </div>

        {/* Tabbed view */}
        <div className="space-y-4">

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <TabBar tabs={TABS} active={tab} onChange={selectTab} />
            {LIST_TABS.includes(tab) && (
              <div className="w-full sm:w-64">
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder={tab === 'sessions' ? 'Search sessions…' : 'Search by name or email…'}
                />
              </div>
            )}
          </div>

          {/* ── Students ── */}
          {tab === 'students' && (
            <div className="space-y-3">
              {filteredStudents.length === 0 && (
                <p className="text-sm italic text-center py-10" style={{ color: 'var(--text-subtle)' }}>No students found</p>
              )}
              {filteredStudents.length > 0 && <StudentRosterHeader />}
              {filteredStudents.map(student => {
                const sessions = sessionsByStudent[student.id] ?? []
                return (
                  <StudentCard key={student.id} student={student} sessions={sessions}>
                    {sessions.map(s => <SessionRow key={s.id} session={s} compact />)}
                  </StudentCard>
                )
              })}
              {filteredStudents.length > 0 && <StudentRosterLegend />}
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
          {tab === 'audit' && (
            <AuditTab sessionById={sessionById} profileById={profileById}
              focusSessionId={auditFocus} onFocusHandled={() => setAuditFocus(null)} />
          )}

          {/* ── Usage & Cost ── */}
          {tab === 'usage' && <UsageTab />}

          {/* ── Tools ── */}
          {tab === 'tools' && <ToolsTab demoSeeded={demoSeeded} betaCircleCount={betaCircleCount} />}

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
    </AuditJumpContext.Provider>
  )
}
