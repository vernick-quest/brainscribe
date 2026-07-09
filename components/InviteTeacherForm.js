'use client'

import { useState } from 'react'

export default function InviteTeacherForm({ assignmentId }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInviteLink('')

    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role: 'teacher', assignmentId }),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok || json.error) {
      setError(json.error ?? 'Something went wrong.')
      return
    }

    setInviteLink(`${window.location.origin}/invite?token=${json.token}`)
    setEmail('')
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-xl transition"
        style={{
          color: 'var(--text-muted)',
          border: '1px solid var(--border-default)',
          backgroundColor: 'var(--surface-card)',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M5.5 8h5M8 5.5v5" strokeLinecap="round" />
        </svg>
        Invite a teacher
      </button>
    )
  }

  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-sm)',
      }}>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
          Invite a teacher to this assignment
        </p>
        <button
          onClick={() => { setOpen(false); setInviteLink(''); setError('') }}
          className="text-xs hover:underline"
          style={{ color: 'var(--text-subtle)' }}
        >
          Cancel
        </button>
      </div>

      {!inviteLink ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Your teacher sees this whole conversation — not just your final draft.{' '}
            <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>That&rsquo;s the point:</span>{' '}
            the back-and-forth shows the words and ideas came from you, with your coach guiding —
            never writing for you.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              id="teacher-email"
              name="teacher-email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="teacher@school.edu"
              required
              className="flex-1 text-sm rounded-xl px-4 py-2 focus:outline-none"
              style={{
                border: '1.5px solid var(--border-strong)',
                color: 'var(--text-body)',
                backgroundColor: 'var(--surface-card)',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--ring)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-strong)'}
            />
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="text-sm font-semibold rounded-xl px-4 py-2 text-white transition disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {loading ? '…' : 'Generate'}
            </button>
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--status-error)' }}>{error}</p>}
        </form>
      ) : (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Share this link — your teacher will sign in with Google and get instant access to this assignment.
          </p>
          <div className="flex gap-2 items-center rounded-xl px-3 py-2"
            style={{ backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border-default)' }}>
            <p className="flex-1 text-xs truncate font-mono" style={{ color: 'var(--text-muted)' }}>{inviteLink}</p>
            <button
              onClick={copyLink}
              className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition text-white"
              style={{ backgroundColor: copied ? 'var(--status-success)' : 'var(--accent)' }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => { setInviteLink(''); setEmail('') }}
            className="text-xs hover:underline"
            style={{ color: 'var(--text-muted)' }}
          >
            Invite another teacher
          </button>
        </div>
      )}
    </div>
  )
}
