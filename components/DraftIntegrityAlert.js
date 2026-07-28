'use client'

import { useEffect, useState } from 'react'

// Draft-integrity alert for the admin dashboard.
//
// Surfaces sessions where a student's Final Draft may be missing work they actually did.
// Deliberately rendered ABOVE the stat tiles and self-fetching on mount: the failure this
// watches for is silent by nature, so it has to announce itself rather than wait to be
// looked for. On 2026-07-20 a 250-word essay saved 74 of its ~185 words and nothing in
// the product noticed — a parent did, days later.
//
// Detection logic lives in lib/draftIntegrity.js (pure + unit-tested); this only renders.

function timeAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function DraftIntegrityAlert() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/draft-integrity', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!cancelled) (d.error ? setError(d.error) : setData(d)) })
      .catch(() => { if (!cancelled) setError('Could not run the draft-integrity check.') })
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <div className="rounded-2xl p-4 text-sm"
        style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', color: 'var(--text-muted)' }}>
        Draft-integrity check unavailable — {error}
      </div>
    )
  }

  if (!data) return null

  const alerts = data.alerts ?? 0
  const warnings = data.warnings ?? 0

  // All clear is worth stating plainly: silence from a monitor should never be
  // ambiguous between "nothing wrong" and "not running".
  if (alerts === 0 && warnings === 0) {
    return (
      <div className="rounded-2xl px-4 py-3 text-sm flex items-center gap-2"
        style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--status-success)' }}>●</span>
        Draft integrity: no missing work detected across the last {data.checked} sessions.
      </div>
    )
  }

  // Split the warnings so the header can't claim "well under target" for a session that
  // has no target at all — it did, for 2 of the 4 rows on 2026-07-28.
  const underTarget = data.flagged.filter(
    f => f.severity === 'warn' && typeof f.shortfallPct === 'number' && f.shortfallPct >= 30
  ).length
  const otherWarnings = Math.max(0, warnings - underTarget)

  const isAlert = alerts > 0
  const accent = isAlert ? 'var(--status-danger, #DC2626)' : 'var(--status-warning, #D97706)'
  const bg = isAlert ? 'var(--status-danger-bg, #FEF2F2)' : 'var(--status-warning-bg, #FFFBEB)'

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${accent}`, backgroundColor: bg }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center gap-3 text-left cursor-pointer">
        <span className="text-lg leading-none" aria-hidden>{isAlert ? '🔴' : '🟡'}</span>
        <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
          {alerts > 0 && `${alerts} session${alerts === 1 ? '' : 's'} may be missing student work`}
          {alerts > 0 && warnings > 0 && ' · '}
          {underTarget > 0 && `${underTarget} well under target`}
          {underTarget > 0 && otherWarnings > 0 && ' · '}
          {otherWarnings > 0 && `${otherWarnings} with empty sections`}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {open ? 'Hide' : 'Review'}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {/* Explicit {' '} — JSX drops the space after an expression when the text node
                continues onto the next line, which rendered as "44recent sessions". */}
            Checked {data.checked}{' '}recent sessions. A session is flagged when the working
            draft holds content the Final Draft doesn&apos;t render, when a lock-in was
            recorded as dropped, or when a finished draft falls well short of its target.
            Empty scaffold slots alone are NOT reported — a coach may skip a component
            deliberately, and a repaired draft keeps its old slots empty.
          </p>
          {data.flagged.map(f => (
            <div key={f.sessionId} className="rounded-xl p-3 text-sm"
              style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="font-semibold" style={{ color: 'var(--text-strong)' }}>
                  {f.studentName ?? 'Unknown student'}
                  {f.studentReportedMissing && (
                    <span className="ml-2 text-[10px] font-bold rounded-full px-2 py-0.5 align-middle"
                      style={{ backgroundColor: accent, color: 'white' }}>
                      STUDENT REPORTED
                    </span>
                  )}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {/* The timestamp is labelled by the status, so it has to MEAN that
                      status: a complete session shows when it completed, anything else
                      shows when it started. Reading created_at as "completed 7d ago"
                      sent the 2026-07-20 investigation looking at the wrong week. */}
                  {f.status} · {f.status === 'complete' && f.completedAt
                    ? timeAgo(f.completedAt)
                    : `started ${timeAgo(f.createdAt)}`}
                </span>
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                {f.assignmentPreview}…
              </p>
              <p className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--text-default)' }}>
                Final draft <strong>{f.finalWords}w</strong>
                {f.orphanedWords > 0 && <> · working draft <strong>{f.workingWords}w</strong> · <span style={{ color: accent }}>{f.orphanedWords}w missing</span></>}
                {f.targetWords ? ` · target ${f.targetWords}w` : ''}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {f.reasons.map((r, i) => (
                  <li key={i} className="text-xs" style={{ color: 'var(--text-muted)' }}>• {r}</li>
                ))}
              </ul>
              <a href={`/transcript/${f.sessionId}`} className="text-xs underline mt-1.5 inline-block"
                style={{ color: 'var(--primary)' }}>
                Open transcript →
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
