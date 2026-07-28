'use client'

import { useState } from 'react'

// "Does this match what you wrote?" — shown under the Final Draft, student-owner only.
//
// The student is the only person who reliably knows whether their finished essay is
// complete. On 2026-07-20 a student's draft saved 74 of ~185 words and every automated
// check in the product was satisfied; the gap was found days later by a parent reading
// the essay. Asking the one witness who was actually there closes that hole.
//
// Tone matters: this is a child looking at work they just finished. It should never read
// as "did our software break?" — it reads as a normal last step, and saying something is
// missing must feel helpful rather than like filing a complaint.

export default function DraftSatisfactionCheck({ sessionId, finalWords, existing }) {
  const [answer, setAnswer] = useState(existing?.matches ?? null)
  const [note, setNote] = useState(existing?.note ?? '')
  const [showNote, setShowNote] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(Boolean(existing))
  const [error, setError] = useState(null)

  async function send(matches, noteText) {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/draft-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, matches, note: noteText || null, finalWords }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not save that.'); return }
      setAnswer(matches); setSaved(true); setShowNote(false)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  // Already answered "looks right" — quiet confirmation, with a way back.
  if (saved && answer === true) {
    return (
      <div className="mt-4 text-sm flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--status-success)' }}>✓</span>
        You confirmed this is your finished writing.
        <button onClick={() => { setSaved(false); setAnswer(null) }}
          className="underline cursor-pointer" style={{ color: 'var(--text-muted)' }}>
          Change
        </button>
      </div>
    )
  }

  // Already flagged — make it clear a human will look, and don't ask again.
  if (saved && answer === false) {
    return (
      <div className="mt-4 rounded-xl p-3 text-sm"
        style={{ border: '1px solid var(--status-warning, #D97706)', backgroundColor: 'var(--status-warning-bg, #FFFBEB)' }}>
        <p style={{ color: 'var(--text-strong)' }}>
          <strong>Thanks for telling us.</strong> You said some of your writing is missing here.
        </p>
        <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
          We&apos;ve flagged it to be looked into. Your conversation is saved in full, so nothing
          you wrote is gone — it can be put back.
        </p>
        <button onClick={() => { setSaved(false); setAnswer(null) }}
          className="underline text-xs mt-2 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
          Actually, it looks right
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl p-3"
      style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-subtle, var(--surface-card))' }}>
      <p className="text-sm font-medium" style={{ color: 'var(--text-strong)' }}>
        Does this match what you wrote?
      </p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
        Read it through. If anything you worked on is missing, say so — we can get it back.
      </p>

      {!showNote && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => send(true, null)}
            disabled={saving}
            className="text-sm rounded-lg px-3 py-1.5 font-medium cursor-pointer disabled:opacity-40"
            style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', color: 'var(--text-default)' }}>
            Yes, that&apos;s my writing
          </button>
          <button
            onClick={() => setShowNote(true)}
            disabled={saving}
            className="text-sm rounded-lg px-3 py-1.5 font-medium cursor-pointer disabled:opacity-40"
            style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', color: 'var(--text-default)' }}>
            Something&apos;s missing
          </button>
        </div>
      )}

      {showNote && (
        <div className="mt-3">
          <label htmlFor="draft-missing-note" className="text-xs" style={{ color: 'var(--text-muted)' }}>
            What&apos;s missing? (optional — even a few words helps)
          </label>
          <textarea
            id="draft-missing-note"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            className="w-full mt-1 rounded-lg p-2 text-sm"
            style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--surface-card)', color: 'var(--text-default)' }}
            placeholder="The part about…"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => send(false, note)}
              disabled={saving}
              className="text-sm rounded-lg px-3 py-1.5 font-medium cursor-pointer disabled:opacity-40"
              style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
              {saving ? 'Sending…' : 'Send'}
            </button>
            <button onClick={() => setShowNote(false)} disabled={saving}
              className="text-sm rounded-lg px-3 py-1.5 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs mt-2" style={{ color: 'var(--status-danger, #DC2626)' }}>{error}</p>}
    </div>
  )
}
