'use client'

// components/KeepWorkingButton.js — "Keep working on this" on a finished transcript.
// Mints (or reuses) a v2 continuation session and opens it. See
// docs/specs/brainscribe-keep-working-spec.md.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function KeepWorkingButton({ sessionId }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function go() {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/continue`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.newSessionId) {
        router.push(`/assignment/${data.newSessionId}`)
        return   // keep the spinner up through navigation
      }
      setError(data?.error || 'Could not start a new draft.')
    } catch {
      setError('Could not start a new draft.')
    }
    setBusy(false)
  }

  return (
    <div className="no-print">
      <button
        onClick={go}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}>
        {busy ? 'Starting…' : 'Keep working on this →'}
      </button>
      {error && <p className="text-xs mt-1" style={{ color: 'var(--status-error)' }}>{error}</p>}
    </div>
  )
}
