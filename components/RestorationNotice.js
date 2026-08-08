'use client'

import { useState } from 'react'

// "We put some of your writing back."
//
// Shown when a session's draft was repaired after the 2026-07-20 class of silent write
// loss. Robert's framing, and it's the right one: if the working draft was showing the
// student the correct work all along, then finding and restoring it is a POSITIVE — young
// software noticing its own mistake and fixing it. The failure mode to avoid is silence.
// Editing a child's essay without telling them is worse than the original bug.
//
// Tone rules:
//   · Their words, not ours — say we put THEIR writing back, never that we wrote anything.
//   · No apology spiral, no jargon ("scaffold", "component", "dropped write").
//   · Specific beats vague: "54 words" is reassuring, "some changes" is alarming.
//   · Dismissible, and once dismissed it never comes back (acknowledged_at).

export default function RestorationNotice({ restoration }) {
  const [dismissed, setDismissed] = useState(Boolean(restoration?.acknowledged_at))
  const [saving, setSaving] = useState(false)

  if (!restoration || dismissed) return null

  const added = Math.max(0, (restoration.words_after ?? 0) - (restoration.words_before ?? 0))

  async function acknowledge() {
    setSaving(true)
    // Optimistic: this is a dismissal, not a transaction. If the write fails the student
    // still gets the banner closed, and it reappears next load rather than trapping them.
    setDismissed(true)
    try {
      await fetch('/api/draft-restoration/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: restoration.session_id }),
      })
    } catch {
      /* dismissal is best-effort by design */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        padding: '16px 18px',
        marginBottom: 20,
        borderRadius: 12,
        border: '1px solid var(--border-default)',
        borderLeft: '4px solid var(--accent)',
        backgroundColor: 'var(--surface-card)',
        boxShadow: 'var(--shadow-soft, 0 1px 3px rgba(0,0,0,0.06))',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6 }}>
          We put some of your writing back
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-default)', lineHeight: 1.55 }}>
          {added > 0
            ? <>We checked this assignment and found <strong>{added} words</strong> you wrote with your
               coach that never made it into your Final Draft. We&rsquo;ve added them back where they
               belong.</>
            : <>We checked this assignment and found some writing you did with your coach that never
               made it into your Final Draft. We&rsquo;ve added it back where it belongs.</>}
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-default)', lineHeight: 1.55, marginTop: 8 }}>
          Nothing was rewritten &mdash; this is your work, in your words. That was our mistake to
          fix, not yours.
        </p>
        {restoration.summary ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 8 }}>
            {restoration.summary}
          </p>
        ) : null}
        <button
          onClick={acknowledge}
          disabled={saving}
          style={{
            marginTop: 12,
            padding: '9px 16px',
            minHeight: 44,
            borderRadius: 8,
            border: '1px solid var(--border-default)',
            backgroundColor: 'transparent',
            color: 'var(--text-strong)',
            fontSize: '0.88rem',
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
