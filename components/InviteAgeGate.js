'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon'

// Shown when someone opens a parent/teacher invite but hasn't asserted their age
// yet. Parent/teacher accounts require 13+; an under-13 can't accept the invite
// (they can only ever be a student). Once 13+ is recorded, we re-run the invite
// page, which then claims the invite and applies the role.
export default function InviteAgeGate({ token, role }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [tooYoung, setTooYoung] = useState(false)
  const [error, setError] = useState('')

  const roleLabel = role === 'teacher' ? 'teacher' : 'parent'

  async function pick(bracket) {
    setError('')
    if (bracket === 'under13') { setTooYoung(true); return }
    setLoading(true)
    const res = await fetch('/api/profile/confirm-role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, age_bracket: '13plus' }),
    })
    if (!res.ok) { setError('Something went wrong. Please try again.'); setLoading(false); return }
    // Age is now on file — re-run the invite page so it claims the invite.
    router.push(`/invite?token=${token}`)
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', backgroundColor: 'var(--brand-cream)' }}>
      <div style={{ backgroundColor: 'var(--surface-card)', borderRadius: 24, padding: '2.5rem', maxWidth: 440, width: '100%', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-default)' }}>
        <img src="/brainscribe-logo.png" alt="BrainScribe" style={{ width: 160, height: 'auto', display: 'block', margin: '0 auto 1.75rem' }} />

        {tooYoung ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: '0.75rem' }}><Icon name="lock" size={32} style={{ color: 'var(--text-muted)' }} /></div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.75rem' }}>
              {roleLabel === 'teacher' ? 'Teacher' : 'Parent'} accounts must be 13 or older
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              This invite can't be used on a under-13 account. If you're a student, you can set up your own account instead.
            </p>
            <a href="/welcome" style={{ display: 'block', textAlign: 'center', padding: '0.9rem', borderRadius: 12, fontWeight: 700, fontSize: '0.9rem', color: '#fff', backgroundColor: 'var(--brand-orange)', textDecoration: 'none' }}>
              Set up a student account →
            </a>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.5rem' }}>
                First, how old are you?
              </h1>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {roleLabel === 'teacher' ? 'Teacher' : 'Parent'} accounts are for ages 13 and older.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { bracket: '13plus', label: "I'm 13 or older", icon: 'cap' },
                { bracket: 'under13', label: "I'm under 13", icon: 'doc' },
              ].map(({ bracket, label, icon }) => (
                <button key={bracket} onClick={() => pick(bracket)} disabled={loading}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '1.25rem', borderRadius: 14, border: '2px solid var(--border-strong)', backgroundColor: 'var(--surface-card)', cursor: loading ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: loading ? 0.6 : 1 }}>
                  <Icon name={icon} size={28} style={{ color: 'var(--brand-orange)', flexShrink: 0 }} />
                  <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--brand-navy)', margin: 0 }}>{label}</p>
                </button>
              ))}
            </div>

            {loading && <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>Setting up your account…</p>}
            {error && <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--status-error)', marginTop: '0.75rem' }}>{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
