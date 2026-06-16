'use client'

import { useState } from 'react'
import Icon from '@/components/Icon'

export default function InviteParentForm() {
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
      body: JSON.stringify({ email, role: 'parent' }),
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
          <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Invite a parent</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Let a parent follow your writing progress
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
          <p className="font-semibold text-sm" style={{ color: 'var(--text-strong)' }}>Invite a parent</p>
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
            Enter your parent's email — they'll get a link to follow your assignments.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="parent@email.com"
              required
              id="parent-email"
              name="parent-email"
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
            Share this link with your parent — they'll sign in with Google and be connected to your account.
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
            onClick={() => { setInviteLink(''); setEmail('') }}
            className="text-xs hover:underline"
            style={{ color: 'var(--text-muted)' }}
          >
            Generate another link
          </button>
        </div>
      )}
    </div>
  )
}
