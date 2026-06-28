'use client'

import { useState } from 'react'
import Icon from '@/components/Icon'

// Co-parent invite: a child's consenting guardian invites a SECOND parent for
// that under-13 child. Posts a parent-role invite bound to the child (childId);
// the recipient becomes a read-only watcher when they claim it — not a
// consenting guardian. Only rendered by ParentSettings when the caller is the
// child's guardian and the 2-parents-per-child cap isn't reached.
export default function CoParentInviteForm({ childId, childName = 'your child' }) {
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
      body: JSON.stringify({ email, role: 'parent', childId }),
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
        className="text-xs font-semibold hover:underline flex items-center gap-1.5"
        style={{ color: 'var(--accent-text)' }}
      >
        <Icon name="users" size={14} style={{ color: 'var(--accent)' }} />
        Invite another parent
      </button>
    )
  }

  return (
    <div className="rounded-xl p-4 space-y-3 w-full"
      style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-default)' }}>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="users" size={16} style={{ color: 'var(--accent)' }} />
          <p className="font-semibold text-sm" style={{ color: 'var(--text-strong)' }}>Invite another parent</p>
        </div>
        <button
          onClick={() => { setOpen(false); setInviteLink(''); setError('') }}
          className="text-xs hover:underline"
          style={{ color: 'var(--text-subtle)' }}
        >
          Cancel
        </button>
      </div>

      {!inviteLink ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Invite a second parent or guardian to follow {childName}'s writing. They'll have
            read-only access — approval and account control stay with you.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="parent@email.com"
              required
              aria-label="Co-parent email"
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
            Share this link with the other parent — they'll sign in with Google and be connected
            to {childName} as a read-only follower.
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
