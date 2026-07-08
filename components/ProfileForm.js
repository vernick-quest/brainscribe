'use client'

import { useState } from 'react'
import Avatar from '@/components/Avatar'

const ROLE_LABELS = {
  student: 'Student',
  parent: 'Parent / Guardian',
  teacher: 'Teacher',
  admin: 'Admin',
}

export default function ProfileForm({ profile, user }) {
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const role = ROLE_LABELS[profile?.role] ?? profile?.role ?? '—'

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setSaved(false)
    setError(null)
    const res = await fetch('/api/profile/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: name }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } else {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong')
    }
  }

  return (
    <div className="space-y-8">

      {/* Avatar + identity */}
      <div className="flex items-center gap-4">
        {/* COPPA data-minimization: minimized profiles.avatar_url only, never
            user.user_metadata.avatar_url. Avatar fail-closes on age_bracket. */}
        <Avatar
          name={name || user?.email}
          avatarUrl={profile?.avatar_url}
          ageBracket={profile?.age_bracket}
          size={64}
          style={{ border: '2px solid var(--border-default)' }}
        />
        <div>
          <p className="font-bold text-base" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
            {name || user?.email}
          </p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
          <span
            className="text-xs font-semibold rounded-full px-2.5 py-0.5 inline-block mt-1.5"
            style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)' }}
          >
            {role}
          </span>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label
            htmlFor="full_name"
            className="block text-xs font-bold uppercase tracking-widest mb-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            Display name
          </label>
          <input
            id="full_name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition"
            style={{
              border: '1.5px solid var(--border-default)',
              backgroundColor: 'var(--surface-card)',
              color: 'var(--text-strong)',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--border-accent)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
          />
        </div>

        <div>
          <label
            className="block text-xs font-bold uppercase tracking-widest mb-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            Email
          </label>
          <p
            className="w-full rounded-xl px-4 py-2.5 text-sm"
            style={{
              border: '1.5px solid var(--border-default)',
              backgroundColor: 'var(--surface-muted)',
              color: 'var(--text-subtle)',
            }}
          >
            {user?.email}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>
            Managed by Google — change it there.
          </p>
        </div>

        {error && (
          <p className="text-sm rounded-xl px-4 py-2.5"
            style={{ backgroundColor: 'var(--status-error-bg)', color: 'var(--status-error)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-2xl px-5 py-2.5 text-sm font-semibold transition"
          style={{
            backgroundColor: saved ? 'var(--status-success)' : 'var(--accent)',
            color: 'white',
            opacity: saving || !name.trim() ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
        </button>
      </form>

    </div>
  )
}
