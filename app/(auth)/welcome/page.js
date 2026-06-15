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

  // Age first, then profile. step: 'age' | 'role' | 'parent-email'
  const [step, setStep] = useState('age')
  const [ageBracket, setAgeBracket] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)

  // Step 1 — age. 13+ unlocks the full role picker; under-13 can only ever be a
  // student and goes straight into the parental-consent flow.
  async function handleAge(bracket) {
    setError('')
    if (bracket === '13plus') {
      setAgeBracket('13plus')
      setStep('role')
      return
    }
    // Under 13 → forced student, held for parental consent.
    setLoading(true)
    const res = await fetch('/api/profile/confirm-role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student', age_bracket: 'under13' }),
    })
    setLoading(false)
    if (!res.ok) { setError('Something went wrong. Please try again.'); return }
    setStep('parent-email')
  }

  // Step 2 (13+ only) — apply the chosen role and route to its home.
  async function handleRoleSelect() {
    if (!role) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/profile/confirm-role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, age_bracket: '13plus' }),
    })
    if (!res.ok) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }
    const destinations = { student: '/dashboard', parent: '/parent', teacher: '/teacher' }
    router.push(destinations[role] ?? '/dashboard')
    // keep the spinner up until navigation
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
            How will you use BrainScribe?
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            You can change this later if you need to.
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
          onClick={handleRoleSelect}
          disabled={!role || loading}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: 14,
            fontWeight: 700,
            fontSize: '1rem',
            color: '#fff',
            backgroundColor: role && !loading ? 'var(--brand-orange)' : 'var(--border-strong)',
            border: 'none',
            cursor: role && !loading ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.15s',
          }}
        >
          {loading ? 'Setting up your account…' : 'Continue →'}
        </button>

        {error && (
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--status-error)', marginTop: '0.75rem' }}>
            {error}
          </p>
        )}

        <button
          onClick={() => { setError(''); setRole(null); setStep('age') }}
          style={{ display: 'block', margin: '0.75rem auto 0', background: 'none', border: 'none', fontSize: '0.85rem', color: 'var(--text-subtle)', cursor: 'pointer' }}
        >
          ← Back
        </button>
      </Card>
    )
  }

  // ── Step: Age bracket (FIRST) ─────────────────────────────────────────────
  if (step === 'age') {
    return (
      <Card>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.5rem' }}>
            Welcome to BrainScribe
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            First, a quick question — this keeps BrainScribe safe for everyone.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: '1.25rem' }}>
          {[
            { bracket: '13plus', label: "I'm 13 or older", emoji: '🎓', desc: 'You can start using BrainScribe right away.' },
            { bracket: 'under13', label: "I'm under 13", emoji: '📝', desc: "We'll need a quick OK from your parent or guardian." },
          ].map(({ bracket, label, emoji, desc }) => (
            <button
              key={bracket}
              onClick={() => handleAge(bracket)}
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

  return null
}

export default function WelcomePage() {
  return <Suspense><WelcomeContent /></Suspense>
}
