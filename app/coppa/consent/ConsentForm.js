'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isValidConsentToken } from '@/lib/coppa'

export default function ConsentForm({ token, studentName, studentEmail }) {
  const [checked1, setChecked1] = useState(false)
  const [checked2, setChecked2] = useState(false)
  const [loading, setLoading] = useState(false)

  const canApprove = checked1 && checked2 && !loading

  async function approve() {
    if (!canApprove) return

    // The token rides inside the OAuth `next` redirect — only ever compose a
    // DB-shaped hex token into that URL (the page already validated it against
    // the DB, but never trust a prop into a redirect unchecked).
    if (!isValidConsentToken(token)) {
      window.location.assign('/coppa/consent')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const origin = window.location.origin

    // Redirect to callback → then to complete page with the token
    const redirectTo = `${origin}/api/auth/callback?next=/coppa/complete?token=${encodeURIComponent(token)}`

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    // Page will navigate away — no need to setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Student info */}
      <div style={{
        backgroundColor: 'var(--surface-spark)',
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 8,
      }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0 0 4px' }}>
          Student requesting access
        </p>
        <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
          {studentName ?? studentEmail}
        </p>
        {studentName && (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {studentEmail}
          </p>
        )}
      </div>

      {/* Consent checkboxes */}
      {[
        {
          id: 'c1',
          checked: checked1,
          onChange: setChecked1,
          label: 'I confirm that I am the parent or guardian of the student listed above, and that I have the authority to give this consent.',
        },
        {
          id: 'c2',
          checked: checked2,
          onChange: setChecked2,
          label: <>
            I agree to BrainScribe's{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--brand-orange)', fontWeight: 600 }}>
              Privacy Policy
            </a>
            {' '}and give consent for my child to use BrainScribe. I understand their session
            transcripts are stored and visible to me and their linked teachers.
          </>,
        },
      ].map(({ id, checked, onChange, label }) => (
        <label key={id} style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          cursor: 'pointer',
          padding: '14px 16px',
          borderRadius: 12,
          border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border-strong)'}`,
          backgroundColor: checked ? 'var(--surface-spark)' : 'var(--surface-card)',
          transition: 'all 0.15s',
        }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={e => onChange(e.target.checked)}
            style={{
              width: 18,
              height: 18,
              accentColor: 'var(--brand-orange)',
              marginTop: 2,
              flexShrink: 0,
              cursor: 'pointer',
            }}
          />
          <span style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-body)' }}>
            {label}
          </span>
        </label>
      ))}

      {/* Approve button */}
      <button
        onClick={approve}
        disabled={!canApprove}
        style={{
          marginTop: 8,
          width: '100%',
          padding: '1rem',
          borderRadius: 14,
          fontWeight: 700,
          fontSize: '1rem',
          color: '#fff',
          backgroundColor: canApprove ? 'var(--brand-orange)' : 'var(--border-strong)',
          border: 'none',
          cursor: canApprove ? 'pointer' : 'not-allowed',
          transition: 'background-color 0.15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {loading ? (
          'Opening Google sign-in…'
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path fill="currentColor" fillOpacity={0.8} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" fillOpacity={0.8} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" fillOpacity={0.8} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" fillOpacity={0.8} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Approve and continue with Google
          </>
        )}
      </button>

      <p style={{
        fontSize: '0.78rem',
        color: 'var(--text-subtle)',
        textAlign: 'center',
        lineHeight: 1.5,
        margin: 0,
      }}>
        You'll sign in with your own Google account — not your child's.
        This creates a parent account that lets you follow their progress.
      </p>
    </div>
  )
}
