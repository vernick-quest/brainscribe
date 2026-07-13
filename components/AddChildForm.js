'use client'

import { useState } from 'react'
import Icon from '@/components/Icon'

// Parent-initiated linking (Entry Point B): a parent generates a role-baked
// invite link for their child. When the child signs in and claims it, a
// read-only watcher relationship is created. Mirrors InviteParentForm.
export default function AddChildForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [emailed, setEmailed] = useState(false)
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
      body: JSON.stringify({ email, role: 'student' }),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok || json.error) {
      setError(json.error ?? 'Something went wrong.')
      return
    }

    setInviteLink(`${window.location.origin}/invite?token=${json.token}`)
    setSentTo(email.trim())
    setEmailed(json.emailed === true)
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
        className="w-full flex items-center gap-3 rounded-2xl px-5 py-4 text-left transition"
        style={{
          backgroundColor: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-xs)',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
      >
        <Icon name="users" size={20} style={{ color: 'var(--accent)' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Add a child</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Invite your child to link their writing to your account
          </p>
        </div>
        <span style={{ color: 'var(--text-subtle)' }}>→</span>
      </button>
    )
  }

  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="users" size={18} style={{ color: 'var(--accent)' }} />
          <p className="font-semibold text-sm" style={{ color: 'var(--text-strong)' }}>Add a child</p>
        </div>
        <button
          onClick={() => { setOpen(false); setInviteLink(''); setError('') }}
          className="text-sm hover:underline"
          style={{ color: 'var(--text-subtle)' }}
        >
          Cancel
        </button>
      </div>

      {!inviteLink ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Enter your child's email to generate an invite link, then share it with them.
            They'll sign in with that email to connect to your account.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="child@email.com"
              required
              id="child-email"
              name="child-email"
              className="flex-1 text-sm rounded-xl px-4 py-2.5 focus:outline-none"
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
              className="text-sm font-semibold rounded-xl px-4 py-2.5 text-white transition disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {loading ? '…' : 'Generate link'}
            </button>
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--status-error)' }}>{error}</p>}
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {emailed
              ? `We emailed the invite link to ${sentTo}. You can also share it directly:`
              : "Share this link with your child — they'll sign in with Google and be connected to your account."}
          </p>
          <div className="flex gap-2 items-center rounded-xl px-4 py-2.5"
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
            onClick={() => { setInviteLink(''); setEmail(''); setSentTo(''); setEmailed(false) }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold rounded-full px-4 py-2 transition"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <Icon name="users" size={15} style={{ color: 'currentColor' }} />
            Add another child
          </button>
        </div>
      )}
    </div>
  )
}
