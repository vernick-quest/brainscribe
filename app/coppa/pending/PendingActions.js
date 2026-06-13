'use client'

import { useState } from 'react'

export default function PendingActions({ parentEmail, daysLeft }) {
  const [status, setStatus] = useState('idle') // idle | sending | sent | error

  async function resend() {
    setStatus('sending')
    try {
      const res = await fetch('/api/coppa/resend', { method: 'POST' })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      {status === 'sent' ? (
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--status-success)',
          backgroundColor: 'var(--status-success-bg)',
          padding: '10px 18px',
          borderRadius: 10,
        }}>
          ✓ Email resent to {parentEmail}
        </p>
      ) : status === 'error' ? (
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--status-error)',
          backgroundColor: 'var(--status-error-bg)',
          padding: '10px 18px',
          borderRadius: 10,
        }}>
          Something went wrong. Please try again.
        </p>
      ) : null}

      <button
        onClick={resend}
        disabled={status === 'sending' || status === 'sent'}
        style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: 'var(--brand-orange)',
          background: 'none',
          border: '1.5px solid var(--brand-orange)',
          borderRadius: 10,
          padding: '10px 22px',
          cursor: status === 'sending' || status === 'sent' ? 'default' : 'pointer',
          opacity: status === 'sending' || status === 'sent' ? 0.5 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {status === 'sending' ? 'Sending…' : 'Resend email'}
      </button>

      <a href="/api/auth/signout"
        style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', textDecoration: 'none' }}>
        Not you? Sign out
      </a>
    </div>
  )
}
