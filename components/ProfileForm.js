'use client'

import { useState } from 'react'
import Avatar from '@/components/Avatar'

const ROLE_LABELS = {
  student: 'Student',
  parent: 'Parent / Guardian',
  teacher: 'Teacher',
  admin: 'Admin',
}

// Format a US phone as (XXX) XXX-XXXX as the user types — works whether or not they
// added parens/hyphens, and reformats a pasted or previously-stored raw number.
// Explicit international numbers (leading +) pass through untouched.
function formatPhone(input) {
  const raw = String(input ?? '')
  if (raw.trimStart().startsWith('+')) return raw
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d[0] === '1') d = d.slice(1) // drop US country code
  d = d.slice(0, 10)
  if (d.length === 0) return ''
  if (d.length < 4) return `(${d}`
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export default function ProfileForm({ profile, user }) {
  const [name, setName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(formatPhone(profile?.phone ?? ''))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const role = ROLE_LABELS[profile?.role] ?? profile?.role ?? '—'
  // Contact phone is an adult-account field — never collect a minor's phone (COPPA).
  const isAdult = profile?.role !== 'student'

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setSaved(false)
    setError(null)
    const res = await fetch('/api/profile/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isAdult ? { full_name: name, phone } : { full_name: name }),
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
            user.user_metadata.avatar_url. This is the viewer's OWN identity card, so
            per the Avatar contract a non-student sees their own photo (ageBracket
            '13plus'); a student stays fail-closed on their real bracket (an under-13's
            avatar_url is nulled anyway). Mirrors Navbar.js. */}
        <Avatar
          name={name || user?.email}
          avatarUrl={profile?.avatar_url}
          ageBracket={profile?.role === 'student' ? profile?.age_bracket : '13plus'}
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

        {isAdult && (
          <div>
            <label
              htmlFor="phone"
              className="block text-xs font-bold uppercase tracking-widest mb-1.5"
              style={{ color: 'var(--text-muted)' }}
            >
              Contact phone <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              placeholder="(555) 123-4567"
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
        )}

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
