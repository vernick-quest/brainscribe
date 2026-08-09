'use client'

import { useState } from 'react'

// "Something's missing" — a quiet escape hatch in the live draft panel.
//
// WHY: on 2026-07-01 Elio typed "The body is not showing where all my writing is" into the
// coach chat, mid-session. The coach replied "don't worry about that right now" and moved
// on. He was correct, the write really had been dropped, and his report reached nobody for
// a month. The transcript check (052) only asks once the essay is finished — this is the
// same question available at the moment a student actually notices.
//
// SPAM CONTROL BY CONSTRUCTION, not by rate limiting: one standing report per session per
// source (unique index, migration 053). Tapping it again edits the existing report. A
// student can't generate a queue of alerts, and an honest student who changes their mind
// isn't punished for it.
//
// Deliberately understated: a small text link, not a red button. Most students who open
// this will be wrong about it, and that has to stay completely fine.

export default function MissingWorkFlag({ sessionId, draftWords }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function report() {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/draft-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          matches: false,
          note: note.trim() || null,
          finalWords: draftWords ?? null,
          source: 'in_session',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not send that.'); return }
      setSent(true)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  if (sent) {
    return (
      <p role="status" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
        Thanks for telling us &mdash; we&rsquo;ve flagged this assignment to look at. Keep going; your
        coach still has everything you&rsquo;ve said.
      </p>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          marginTop: 10, padding: '6px 0', minHeight: 44,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'underline',
        }}
      >
        Something missing from your draft?
      </button>
    )
  }

  return (
    <div style={{ marginTop: 10, fontSize: '0.85rem' }}>
      <label htmlFor="missing-work-note" style={{ display: 'block', color: 'var(--text-default)', marginBottom: 6 }}>
        What&rsquo;s missing? Even &ldquo;my second paragraph isn&rsquo;t here&rdquo; helps.
      </label>
      <textarea
        id="missing-work-note"
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={3}
        maxLength={1000}
        style={{
          width: '100%', padding: 10, borderRadius: 8,
          border: '1px solid var(--border-default)', fontSize: '0.85rem',
          fontFamily: 'inherit', resize: 'vertical',
        }}
      />
      {error ? <p style={{ color: 'var(--status-error)', marginTop: 6 }}>{error}</p> : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={report}
          disabled={saving}
          style={{
            padding: '8px 14px', minHeight: 44, borderRadius: 8, border: 'none',
            backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)',
            fontSize: '0.85rem', cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Sending…' : 'Tell us'}
        </button>
        <button
          onClick={() => { setOpen(false); setError(null) }}
          style={{
            padding: '8px 14px', minHeight: 44, borderRadius: 8,
            border: '1px solid var(--border-default)', background: 'transparent',
            color: 'var(--text-strong)', fontSize: '0.85rem', cursor: 'pointer',
          }}
        >
          Never mind
        </button>
      </div>
    </div>
  )
}
