'use client'

import { useCallback, useEffect, useState } from 'react'

// Draft-integrity alert for the admin dashboard.
//
// Surfaces sessions where a student's Final Draft may be missing work they actually did,
// and lets an admin ANSWER each one — resolved / not relevant / watching + a note. A
// verdict of resolved or not_relevant hides the alert until its underlying signal changes
// (the route resurfaces a stale verdict), so a real regression can't hide behind an old
// "resolved". Deliberately rendered ABOVE the stat tiles and self-fetching on mount: the
// failure this watches for is silent by nature, so it has to announce itself.
//
// Detection lives in lib/draftIntegrity.js; triage/visibility in lib/draftIntegrityReview.js
// (both pure + unit-tested). This only renders.

const STATUS_LABEL = { resolved: 'Resolved', not_relevant: 'Not relevant', watching: 'Watching' }
const STATUS_OPTIONS = ['resolved', 'not_relevant', 'watching']

function timeAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

// Per-card verdict controls. Manages its own draft state; calls onSaved() after a
// successful write so the parent re-fetches (which applies the new suppression).
function ReviewControls({ flag, accent, onSaved }) {
  const [status, setStatus] = useState(flag.review?.status ?? null)
  const [note, setNote] = useState(flag.review?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Re-sync when a refetch brings a newer verdict for this card (e.g. after saving
  // 'watching', which keeps the card mounted) so the controls never show stale state.
  const serverStatus = flag.review?.status ?? null
  const serverNote = flag.review?.note ?? ''
  useEffect(() => { setStatus(serverStatus); setNote(serverNote) }, [serverStatus, serverNote])

  async function save(nextStatus) {
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/admin/draft-integrity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: flag.sessionId, status: nextStatus, note, signal: flag.signal }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) { setErr(json.error ?? 'Save failed.'); return }
      onSaved()
    } catch { setErr('Network error.') }
    finally {
      // Always clear: on a 'watching' save the card stays mounted, so leaving this
      // set left the controls stuck on "Saving…" until a page reload.
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 pt-2" style={{ borderTop: '1px dashed var(--border-default)' }}>
      {flag.review && (
        <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Verdict: <strong style={{ color: 'var(--text-strong)' }}>{STATUS_LABEL[flag.review.status] ?? flag.review.status}</strong>
          {flag.review.reviewedByName ? ` · ${flag.review.reviewedByName}` : ''}
          {flag.review.reviewedAt ? ` · ${timeAgo(flag.review.reviewedAt)}` : ''}
          {flag.review.signalChanged && (
            <span className="ml-1 font-bold" style={{ color: accent }}>· signal changed since this verdict — re-review</span>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 items-center">
        {STATUS_OPTIONS.map(s => {
          const active = status === s
          return (
            <button key={s} type="button" disabled={saving}
              onClick={() => setStatus(s)}
              aria-pressed={active}
              className="text-[11px] font-semibold rounded-full px-2.5 py-1 transition cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: active ? 'var(--primary)' : 'var(--surface-muted)',
                color: active ? 'white' : 'var(--text-muted)',
                border: '1px solid var(--border-default)',
              }}>
              {STATUS_LABEL[s]}
            </button>
          )
        })}
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Note (what you found / what shipped)…"
        rows={2}
        className="mt-2 w-full text-xs rounded-lg px-2 py-1.5 resize-y"
        style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', color: 'var(--text-default)' }}
      />
      <div className="flex items-center gap-2 mt-1.5">
        <button type="button" disabled={saving || !status}
          onClick={() => save(status)}
          className="text-[11px] font-bold rounded-full px-3 py-1 disabled:opacity-50 cursor-pointer"
          style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
          {saving ? 'Saving…' : 'Save verdict'}
        </button>
        {err && <span className="text-[11px]" style={{ color: 'var(--status-error, #DC2626)' }}>{err}</span>}
      </div>
    </div>
  )
}

export default function DraftIntegrityAlert() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)
  const [showResolved, setShowResolved] = useState(false)

  const load = useCallback((withResolved) => {
    setError(null)
    fetch(`/api/admin/draft-integrity${withResolved ? '?showResolved=1' : ''}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError('Could not run the draft-integrity check.'))
  }, [])

  useEffect(() => { load(false) }, [load])

  const toggleResolved = () => {
    const next = !showResolved
    setShowResolved(next)
    load(next)
  }
  const refresh = () => load(showResolved)

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
  const hiddenResolved = data.hiddenResolved ?? 0

  // Nothing open. State it plainly — but if verdicts are hiding some, offer them.
  if (alerts === 0 && warnings === 0) {
    return (
      <div className="rounded-2xl px-4 py-3 text-sm flex items-center gap-2 flex-wrap"
        style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--status-success)' }}>●</span>
        Draft integrity: no open alerts across the last {data.checked} sessions.
        {(hiddenResolved > 0 || showResolved) && (
          <button type="button" onClick={toggleResolved} className="underline cursor-pointer" style={{ color: 'var(--primary)' }}>
            {showResolved ? 'Hide resolved' : `Show resolved (${hiddenResolved})`}
          </button>
        )}
        {showResolved && data.flagged.length > 0 && (
          <div className="w-full mt-2 space-y-2">
            {data.flagged.map(f => (
              <FlagCard key={f.sessionId} f={f} accent="var(--text-muted)" onSaved={refresh} />
            ))}
          </div>
        )}
      </div>
    )
  }

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
          {warnings > 0 && `${warnings} worth a look`}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {open ? 'Hide' : 'Review'}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs flex-1" style={{ color: 'var(--text-muted)' }}>
              {/* Explicit {' '} — JSX drops the space after an expression when the text node
                  continues onto the next line, which rendered as "44recent sessions". */}
              Checked {data.checked}{' '}recent sessions (demo accounts excluded). This watches for ONE
              thing: a disconnect between the working draft and the Final Draft — content the draft
              doesn&apos;t render, or a lock-in the client recorded as dropped. Word counts are not a
              fault (targets are a ceiling, and writing less is the student&apos;s call), and an empty
              scaffold slot on its own isn&apos;t either — a coach may skip a component deliberately,
              and a repaired draft keeps its old slots empty.
            </p>
            {(hiddenResolved > 0 || showResolved) && (
              <button type="button" onClick={toggleResolved} className="text-xs underline cursor-pointer whitespace-nowrap" style={{ color: 'var(--primary)' }}>
                {showResolved ? 'Hide resolved' : `Show resolved (${hiddenResolved})`}
              </button>
            )}
          </div>
          {data.flagged.map(f => (
            <FlagCard key={f.sessionId} f={f} accent={accent} onSaved={refresh} />
          ))}
        </div>
      )}
    </div>
  )
}

function FlagCard({ f, accent, onSaved }) {
  const resolvedish = f.review && (f.review.status === 'resolved' || f.review.status === 'not_relevant') && !f.review.signalChanged
  return (
    <div className="rounded-xl p-3 text-sm"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', opacity: resolvedish ? 0.72 : 1 }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="font-semibold" style={{ color: 'var(--text-strong)' }}>
          {f.studentName ?? 'Unknown student'}
          {f.studentReportedMissing && (
            <span className="ml-2 text-[10px] font-bold rounded-full px-2 py-0.5 align-middle"
              style={{ backgroundColor: accent, color: 'white' }}>
              STUDENT REPORTED
            </span>
          )}
          {f.review && (
            <span className="ml-2 text-[10px] font-bold rounded-full px-2 py-0.5 align-middle"
              style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}>
              {STATUS_LABEL[f.review.status] ?? f.review.status}{f.review.signalChanged ? ' · STALE' : ''}
            </span>
          )}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {f.status} · {f.status === 'complete' && f.completedAt ? timeAgo(f.completedAt) : `started ${timeAgo(f.createdAt)}`}
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
      <ReviewControls flag={f} accent={accent} onSaved={onSaved} />
    </div>
  )
}
