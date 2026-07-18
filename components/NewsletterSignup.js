'use client'

import { useState } from 'react'

// Email capture. Posts to /api/subscribe (service-role insert, validated +
// rate-limited). `source` records where the signup happened so we can see which
// surface converts. Copy is configurable so the same component serves both the
// blog ("get new posts") and the landing waitlist ("get early access"). Brand:
// navy ink + warm orange spark on cream.
export default function NewsletterSignup({
  source = 'blog',
  compact = false,
  title = 'Get new posts',
  subtitle = 'Practical writing help for kids who freeze at the blank page — a couple of times a week. No spam.',
  cta = 'Subscribe',
  successTitle = "You're in — thanks!",
  successBody = "We'll send new posts as they go up. No spam, unsubscribe anytime.",
}) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | sending | done | error
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setState('sending'); setError('')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Something went wrong.'); setState('error'); return }
      setState('done'); setEmail('')
    } catch { setError('Network error — please try again.'); setState('error') }
  }

  if (state === 'done') {
    return (
      <div className="rounded-2xl px-5 py-4 text-center"
        style={{ backgroundColor: 'var(--surface-spark)', border: '1.5px solid var(--border-accent)' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--text-strong)', margin: 0 }}>{successTitle}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', margin: '4px 0 0' }}>
          {successBody}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl"
      style={{
        backgroundColor: 'var(--surface-spark)', border: '1.5px solid var(--border-accent)',
        padding: compact ? 'var(--space-4) var(--space-5)' : 'var(--space-6)',
      }}>
      {!compact && (
        <>
          <p className="font-bold" style={{ font: 'var(--type-subhead)', color: 'var(--text-strong)', margin: 0 }}>
            {title}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)', margin: '4px 0 var(--space-4)' }}>
            {subtitle}
          </p>
        </>
      )}
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@email.com"
          aria-label="Email address"
          required
          className="flex-1 text-sm rounded-xl px-4 py-2.5 focus:outline-none transition"
          style={{ border: '1.5px solid var(--border-strong)', backgroundColor: 'var(--surface-card)', color: 'var(--text-strong)' }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--ring)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
        />
        <button
          type="submit"
          disabled={state === 'sending' || !email.trim()}
          className="shrink-0 text-sm font-bold rounded-xl px-5 py-2.5 text-white transition disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}>
          {state === 'sending' ? 'Signing up…' : cta}
        </button>
      </form>
      {error && <p className="text-xs mt-2" style={{ color: 'var(--status-error)' }}>{error}</p>}
    </div>
  )
}
