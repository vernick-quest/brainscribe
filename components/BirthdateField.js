'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Inline view/edit for a birthdate, wired to the guarded gate endpoint
// (PATCH /api/profile/birthdate). birthdate is the COPPA gate's source of truth,
// so age_bracket / consent are recomputed server-side — we just reflect the
// result. `studentId` is always the TARGET profile's id: when it equals the
// caller it's a self-edit; when it's a linked child the endpoint verifies the
// parent→child relationship (and a parent correction into under-13 doubles as
// the consent event, keeping the child active).
function formatDob(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

export default function BirthdateField({ studentId, birthdate, label }) {
  const router = useRouter()
  const [current, setCurrent] = useState(birthdate ?? null)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(birthdate ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const display = formatDob(current)

  async function save() {
    if (!value) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/profile/birthdate', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ birthdate: value, studentId }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok || json.error) {
      setError(json.error ?? 'Could not save that birthday.')
      return
    }
    setCurrent(value)
    setEditing(false)
    // Re-fetch server data so the new age bracket (avatar suppression, consent
    // state) is reflected without a manual reload.
    router.refresh()
  }

  function cancel() {
    setValue(current ?? '')
    setEditing(false)
    setError('')
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--text-subtle)' }}>{label}</span>

      {!editing ? (
        <>
          <span className="text-sm" style={{ color: display ? 'var(--text-body)' : 'var(--text-subtle)' }}>
            {display ?? 'Not set'}
          </span>
          <button
            onClick={() => { setValue(current ?? ''); setEditing(true) }}
            className="text-xs font-semibold hover:underline"
            style={{ color: 'var(--accent-text)' }}
          >
            {display ? 'Edit' : 'Add'}
          </button>
        </>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={value}
            max={today}
            aria-label={label}
            onChange={e => setValue(e.target.value)}
            className="text-sm rounded-lg px-3 py-1.5 focus:outline-none"
            style={{ border: '1.5px solid var(--border-strong)', color: 'var(--text-body)', backgroundColor: 'var(--surface-card)' }}
          />
          <button
            onClick={save}
            disabled={saving || !value}
            className="text-xs font-semibold rounded-lg px-3 py-1.5 text-white transition disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {saving ? '…' : 'Save'}
          </button>
          <button onClick={cancel} className="text-xs hover:underline" style={{ color: 'var(--text-subtle)' }}>
            Cancel
          </button>
        </div>
      )}

      {error && <span className="text-xs w-full" style={{ color: 'var(--status-error)' }}>{error}</span>}
    </div>
  )
}
