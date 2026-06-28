'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Lets a parent remove their link to a child (stops following — does not delete
// the child's account or their work). Two-step confirm; errors (e.g. the COPPA
// guardian guard) surface inline.
export default function UnlinkChildButton({ studentId, watcherId, childName }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function unlink() {
    setBusy(true)
    setError('')
    const res = await fetch('/api/parent/unlink-child', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, watcherId }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || json.error) {
      setError(json.error ?? 'Could not unlink.')
      setConfirming(false)
      return
    }
    router.refresh()
  }

  return (
    <div className="shrink-0 flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Stop following {childName}?</span>
          <button
            onClick={unlink}
            disabled={busy}
            className="text-xs font-semibold rounded-full px-3 py-1.5 text-white transition disabled:opacity-40"
            style={{ backgroundColor: 'var(--status-error)' }}
          >
            {busy ? '…' : 'Unlink'}
          </button>
          <button
            onClick={() => { setConfirming(false); setError('') }}
            className="text-xs hover:underline"
            style={{ color: 'var(--text-subtle)' }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-xs font-medium transition hover:underline"
          style={{ color: 'var(--text-subtle)' }}
          aria-label={`Unlink ${childName}`}
        >
          Unlink
        </button>
      )}
      {error && <p className="text-xs text-right max-w-[16rem]" style={{ color: 'var(--status-error)' }}>{error}</p>}
    </div>
  )
}
