'use client'

import { useState, Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ROLES = [
  {
    id: 'student',
    emoji: '✏️',
    label: 'Student',
    description: "I'm here to work on my writing assignments.",
  },
  {
    id: 'parent',
    emoji: '👪',
    label: 'Parent',
    description: "I want to follow my child's writing progress.",
  },
  {
    id: 'teacher',
    emoji: '📋',
    label: 'Teacher',
    description: "I've been invited to review a student's work.",
  },
]

// ── Shared card shell ─────────────────────────────────────────────────────────
function Card({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
      backgroundColor: 'var(--brand-cream)',
    }}>
      <div style={{
        backgroundColor: 'var(--surface-card)',
        borderRadius: 24,
        padding: '2.5rem',
        maxWidth: 440,
        width: '100%',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-default)',
      }}>
        <img
          src="/brainscribe-logo.png"
          alt="BrainScribe"
          style={{ width: 160, height: 'auto', display: 'block', margin: '0 auto 1.75rem' }}
        />
        {children}
      </div>
    </div>
  )
}

function WelcomeContent() {
  const router = useRouter()

  // Admins should never be here — redirect them straight to /admin
  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('role').single().then(({ data }) => {
      if (data?.role === 'admin') router.replace('/admin')
    })
  }, [router])

  // step: 'role' | 'age' | 'parent-email' | 'dead-end'
  const [step, setStep] = useState('role')
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)

  // Called when user picks an age bracket on the age step
  async function handleAgeSelect(bracket) {
    setLoading(true)
    setError('')

    const res = await fetch('/api/profile/confirm-role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, age_bracket: bracket }),
    })

    if (!res.ok) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    if (bracket === '13plus') {
      // All good — route to role dashboard
      const destinations = { student: '/dashboard', parent: '/parent', teacher: '/teacher' }
      router.push(destinations[role] ?? '/dashboard')
      // keep loading spinner until navigation
    } else {
      // Under 13
      setLoading(false)
      if (role === 'student') {
        setStep('parent-email')
      } else {
        // Parents/teachers must be 13+ to have an account
        setStep('dead-end')
      }
    }
  }

  // Called from parent-email step
  async function handleSendConsent() {
    if (!parentEmail) return
    setSendingEmail(true)
    setError('')

    const res = await fetch('/api/coppa/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentEmail }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to send email. Please try again.')
      setSendingEmail(false)
      return
    }

    router.push('/coppa/pending')
  }

  // ── Step: Role picker ─────────────────────────────────────────────────────
  if (step === 'role') {
    return (
      <Card>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.5rem' }}>
            Welcome to BrainScribe
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Just one quick question before we get started.
          </p>
        </div>

        <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--brand-navy)', textAlign: 'center', marginBottom: '0.75rem' }}>
          Who are you?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.25rem' }}>
          {ROLES.map(r => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '1rem 1.25rem',
                borderRadius: 14,
                border: `2px solid ${role === r.id ? 'var(--accent)' : 'var(--border-strong)'}`,
                backgroundColor: role === r.id ? 'var(--surface-spark)' : 'var(--surface-card)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{r.emoji}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--brand-navy)', margin: 0 }}>{r.label}</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{r.description}</p>
              </div>
              {role === r.id && (
                <span style={{ color: 'var(--brand-orange)', fontSize: '1.1rem', flexShrink: 0 }}>✓</span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => { setError(''); setStep('age') }}
          disabled={!role}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: 14,
            fontWeight: 700,
            fontSize: '1rem',
            color: '#fff',
            backgroundColor: role ? 'var(--brand-orange)' : 'var(--border-strong)',
            border: 'none',
            cursor: role ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.15s',
          }}
        >
          Continue →
        </button>
      </Card>
    )
  }

  // ── Step: Age bracket ─────────────────────────────────────────────────────
  if (step === 'age') {
    return (
      <Card>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.5rem' }}>
            One more quick thing
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            This helps us keep BrainScribe safe for everyone.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1.25rem' }}>
          {[
            { bracket: '13plus', label: "I'm 13 or older", emoji: '🎓', desc: 'You can start using BrainScribe right away.' },
            { bracket: 'under13', label: "I'm under 13", emoji: '📝', desc: "We'll need a quick OK from your parent or guardian." },
          ].map(({ bracket, label, emoji, desc }) => (
            <button
              key={bracket}
              onClick={() => handleAgeSelect(bracket)}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '1.25rem 1.25rem',
                borderRadius: 14,
                border: '2px solid var(--border-strong)',
                backgroundColor: 'var(--surface-card)',
                cursor: loading ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                opacity: loading ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '1.75rem', flexShrink: 0 }}>{emoji}</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--brand-navy)', margin: 0 }}>{label}</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '3px 0 0' }}>{desc}</p>
              </div>
            </button>
          ))}
        </div>

        {loading && (
          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Setting up your account…
          </p>
        )}

        {error && (
          <p style={{
            textAlign: 'center',
            fontSize: '0.875rem',
            color: 'var(--status-error)',
            backgroundColor: 'var(--status-error-bg)',
            padding: '10px',
            borderRadius: 10,
          }}>
            {error}
          </p>
        )}

        <button
          onClick={() => setStep('role')}
          style={{
            display: 'block',
            margin: '0.75rem auto 0',
            background: 'none',
            border: 'none',
            fontSize: '0.85rem',
            color: 'var(--text-subtle)',
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>
      </Card>
    )
  }

  // ── Step: Parent email (under-13 student) ─────────────────────────────────
  if (step === 'parent-email') {
    return (
      <Card>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            backgroundColor: 'var(--surface-spark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.75rem',
            margin: '0 auto 1rem',
          }}>
            📬
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.5rem' }}>
            Let's get your parent's OK
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Since you're under 13, we need a parent or guardian to approve your
            account. We'll send them a quick email — no payment needed.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--brand-navy)', marginBottom: 6 }}>
              Parent or guardian's email
            </label>
            <input
              type="email"
              value={parentEmail}
              onChange={e => setParentEmail(e.target.value)}
              placeholder="parent@example.com"
              disabled={sendingEmail}
              style={{
                width: '100%',
                padding: '0.8rem 1rem',
                borderRadius: 12,
                border: '1.5px solid var(--border-strong)',
                fontSize: '0.95rem',
                color: 'var(--text-body)',
                backgroundColor: 'var(--surface-card)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onKeyDown={e => { if (e.key === 'Enter' && parentEmail) handleSendConsent() }}
            />
          </div>

          {error && (
            <p style={{
              fontSize: '0.85rem',
              color: 'var(--status-error)',
              backgroundColor: 'var(--status-error-bg)',
              padding: '10px 14px',
              borderRadius: 10,
            }}>
              {error}
            </p>
          )}

          <button
            onClick={handleSendConsent}
            disabled={!parentEmail || sendingEmail}
            style={{
              width: '100%',
              padding: '1rem',
              borderRadius: 14,
              fontWeight: 700,
              fontSize: '1rem',
              color: '#fff',
              backgroundColor: parentEmail && !sendingEmail ? 'var(--brand-orange)' : 'var(--border-strong)',
              border: 'none',
              cursor: parentEmail && !sendingEmail ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.15s',
            }}
          >
            {sendingEmail ? 'Sending…' : 'Send consent request →'}
          </button>

          <p style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
            Your account will be ready once approved.
            If not approved within 7 days, it will be automatically deleted.
          </p>
        </div>
      </Card>
    )
  }

  // ── Step: Dead end (under-13 non-student) ─────────────────────────────────
  if (step === 'dead-end') {
    return (
      <Card>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.75rem' }}>
            You must be 13 or older
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
            Parent and teacher accounts on BrainScribe require you to be 13 or older.
            If you're a student, go back and select "Student" — we have a parent-approval
            flow that will get you set up safely.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => { setStep('role'); setRole(null); }}
              style={{
                width: '100%',
                padding: '0.9rem',
                borderRadius: 12,
                fontWeight: 700,
                fontSize: '0.9rem',
                color: '#fff',
                backgroundColor: 'var(--brand-orange)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ← Back to role selection
            </button>
            <a href="/api/auth/signout"
              style={{
                display: 'block',
                textAlign: 'center',
                fontSize: '0.85rem',
                color: 'var(--text-subtle)',
                padding: '0.5rem',
                textDecoration: 'none',
              }}>
              Sign out
            </a>
          </div>
        </div>
      </Card>
    )
  }

  return null
}

export default function WelcomePage() {
  return <Suspense><WelcomeContent /></Suspense>
}
