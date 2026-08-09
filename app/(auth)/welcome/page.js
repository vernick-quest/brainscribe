'use client'

import { useState, useRef, Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { displayNameNeedsConfirm } from '@/lib/displayName'
import Icon from '@/components/Icon'
import { UNDER13_SETUP_COPY } from '@/lib/parentFirst'
import { nextWelcomeStep } from '@/lib/welcomeFlow'

const ROLES = [
  {
    id: 'student',
    icon: 'pencil',
    label: 'Student',
    description: "I'm here to work on my writing assignments.",
  },
  {
    id: 'parent',
    icon: 'users',
    label: 'Parent',
    description: "I want to follow my child's writing progress.",
  },
  {
    id: 'teacher',
    icon: 'clipboard',
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

  // Question order lives in lib/welcomeFlow.js:
  //   age → name (only when flagged) → access-code (13+ only) → role
  // step: 'age' | 'name' | 'access-code' | 'role' | 'parent-email' | 'parent-asked'
  const [step, setStep] = useState('age')
  const [ageBracket, setAgeBracket] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  // Display-name soft confirm (BACKLOG "Student name validation at signup") —
  // the Google name feeds the COPPA consent email, so an org/placeholder name
  // gets one gentle "is this really your name?" nudge before age/role.
  const [flaggedName, setFlaggedName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [savingName, setSavingName] = useState(false)
  // Beta Circle access gate (migration 045). A brand-new self-signup with no code and
  // no invite must eventually enter one; grandfathered + invited users have
  // access_granted=true and never see it. It is now the LAST gate (after age, after
  // the name nudge) rather than the first — asking it first meant anyone without a
  // code never reached the age question, so we held a name and email with no age
  // assertion and the parent-first under-13 flow never ran.
  const [code, setCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  // The two flow flags live in REFS, not state, and the in-flight init() is awaited
  // before any step is resolved. init() is async and age is now the first question,
  // so a fast tapper could otherwise answer age before the flags land and silently
  // skip the code gate — and /welcome is the ONLY place a code can be entered, so a
  // skip strands them outside the product for good.
  const nameNudgeRef = useRef(false)
  const accessGatedRef = useRef(false)
  const initRef = useRef(null)

  // Admins should never be here — redirect straight to /admin. Same fetch decides
  // the name nudge and whether the access gate applies. FAIL-OPEN by design: if the
  // select errors (a pre-migration column missing) data is null and we return, so
  // BOTH flags stay false — no name nudge, no code step — and the user still gets
  // the age question. Never lock someone out on a schema lag.
  useEffect(() => {
    const supabase = createClient()
    async function init() {
      const { data } = await supabase
        .from('profiles').select('role, full_name, display_name_confirmed, access_granted').single()
      if (!data) return
      if (data.role === 'admin') { router.replace('/admin'); return }

      const nudge = !data.display_name_confirmed && displayNameNeedsConfirm(data.full_name)
      if (nudge) {
        const words = (data.full_name ?? '').trim().split(/\s+/).filter(Boolean)
        setFirstName(words[0] ?? '')
        setLastName(words.slice(1).join(' '))
        setFlaggedName(data.full_name ?? '')
        nameNudgeRef.current = true
      }

      // Beta Circle access gate: only a fresh self-signup with no code AND no invite
      // is gated. access_granted=true (grandfathered / invited / already-redeemed)
      // skips this entirely. Belt-and-suspenders: if a relationship already exists but
      // access somehow wasn't set (odd row), treat as linked and DON'T lock them out —
      // the server-side session gate is the real enforcement. Pre-migration-045 the
      // select errors → data is null → we returned above (gate stays off, fail-open).
      //
      // This only RECORDS whether the gate applies — it must never move the step.
      // Jumping to the code step here is exactly the bug being fixed: it returned
      // before the age question ever rendered, so a self-signup (including a
      // twelve-year-old) sat in the DB with no age assertion and the parent-first
      // flow never ran. The step stays 'age'; the code is asked later, by
      // nextWelcomeStep, and only for 13+.
      if (data.access_granted !== true) {
        const { count } = await supabase.from('relationships').select('id', { count: 'exact', head: true })
        if (!count) accessGatedRef.current = true
      }
    }
    // Swallow failures: an init that throws must leave the flags false (gate off),
    // never block the flow. Same fail-open contract as the null-row return above.
    initRef.current = init().catch(e => { console.error('[welcome] init error:', e) })
  }, [router])

  // Read the flow flags, waiting for init() if it's still in flight. Capped so a
  // slow/hanging profile read can never trap the user on the age step — after the
  // cap we proceed with whatever we have, which is the same fail-open outcome as an
  // init that errored (gate off; the server-side gate in lib/access.js is the real
  // enforcement either way).
  async function flowFlags() {
    try {
      await Promise.race([initRef.current, new Promise(r => setTimeout(r, 3000))])
    } catch { /* fail-open */ }
    return { nameNudge: nameNudgeRef.current, accessGated: accessGatedRef.current }
  }

  // Redeem a Beta Circle code. The code is now the LAST gate, so age and any name
  // nudge are already answered by the time we get here — continue forward to the
  // role picker, never back to a question the user has already been asked.
  async function handleRedeem() {
    if (!code.trim()) return
    setRedeeming(true)
    setError('')
    try {
      const res = await fetch('/api/access/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "That code isn't valid. Check with whoever invited you.")
        setRedeeming(false)
        return
      }
      // The gate is cleared. Clear the flag too so a later "← Back" can't bounce
      // them into the code step again.
      accessGatedRef.current = false
      setStep(nextWelcomeStep('access-code', { ageBracket, accessGated: false }))
    } catch (e) {
      console.error('[welcome] redeem error:', e)
      setError('Something went wrong. Please try again.')
    }
    setRedeeming(false)
  }

  // Save the confirmed/corrected name, then continue. The nudge now sits AFTER the
  // age answer, so "next" is the parent flow for an under-13 and the code/role step
  // for 13+. Fail-open: the nudge must never block signup, so any error still
  // advances the flow.
  async function handleConfirmName() {
    if (!firstName.trim()) return
    setSavingName(true)
    setError('')
    try {
      const res = await fetch('/api/profile/confirm-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName }),
      })
      if (!res.ok) console.error('[welcome] confirm-name save failed')
    } catch (e) {
      console.error('[welcome] confirm-name error:', e)
    }
    setSavingName(false)
    setStep(nextWelcomeStep('name', { ageBracket, ...(await flowFlags()) }))
  }

  // Step 1 — AGE, always first. 13+ continues through the name nudge / code gate to
  // the role picker; under-13 can only ever be a student, is recorded as under-13
  // immediately (this PATCH is the age assertion that used to never happen), and
  // goes into the parent-first flow — never the access code.
  async function handleAge(bracket) {
    setError('')
    if (bracket === '13plus') {
      setAgeBracket('13plus')
      setLoading(true)
      const flags = await flowFlags()
      setLoading(false)
      setStep(nextWelcomeStep('age', { ageBracket: '13plus', ...flags }))
      return
    }
    // Under 13 → forced student, held for parent-led consent (migration 055).
    setLoading(true)
    const res = await fetch('/api/profile/confirm-role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student', age_bracket: 'under13' }),
    })
    if (!res.ok) {
      setLoading(false)
      setError('Something went wrong. Please try again.')
      return
    }
    const flags = await flowFlags()
    setLoading(false)
    setAgeBracket('under13')
    setStep(nextWelcomeStep('age', { ageBracket: 'under13', ...flags }))
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
      // A returning under-13 who re-answers "13 or older" is refused by the sticky
      // COPPA lock (confirm-role, 403 coppa_locked). That refusal is correct, but a
      // generic error would leave them on the role picker with no way forward — so
      // send them where they actually belong: the parent-first flow.
      const body = await res.json().catch(() => ({}))
      if (body.code === 'coppa_locked') {
        setAgeBracket('under13')
        setLoading(false)
        // nameNudge false: they've already been past the nudge to get here.
        setStep(nextWelcomeStep('age', { ageBracket: 'under13', nameNudge: false }))
        return
      }
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }
    const destinations = { student: '/folder', parent: '/parent', teacher: '/teacher' }
    router.push(destinations[role] ?? '/folder')
    // keep the spinner up until navigation
  }

  // Called from parent-email step.
  //
  // PARENT-FIRST: this asks a parent to CREATE AN ACCOUNT. It does not create a pending
  // consent record and there is no token in the email — so there is nothing a child can
  // cause to be approved, which was the hole in the old flow (Fable red-team #3).
  async function handleRequestParentSetup() {
    if (!parentEmail) return
    setSendingEmail(true)
    setError('')

    const res = await fetch('/api/coppa/request-parent-setup', {
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

    setStep('parent-asked')
  }

  // ── Step: parent asked (under-13 dead end) ──
  // Deliberately terminal. There is no button that grants access, nothing to poll, and
  // nothing to resend — because nothing is pending. The child's next action is to sign
  // back in AFTER a parent has made the account.
  if (step === 'parent-asked') {
    return (
      <Card>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', backgroundColor: 'var(--surface-spark)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem',
          }}>
            <Icon name="mail" size={28} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.5rem' }}>
            Sent &mdash; over to them
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
            {UNDER13_SETUP_COPY.sent}
          </p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', lineHeight: 1.5, margin: 0 }}>
            Nothing to do here in the meantime &mdash; you can close this page.
          </p>
        </div>
      </Card>
    )
  }

  // ── Step: Beta Circle access code (fresh self-signup, no code + no invite) ──
  if (step === 'access-code') {
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
            margin: '0 auto 1rem',
          }}>
            <Icon name="sparkles" size={28} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.5rem' }}>
            You're almost in
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            BrainScribe is opening up through the <strong>Beta Circle</strong>. Enter the
            code you were given to start writing with your coach.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--brand-navy)', marginBottom: 6 }}>
              Beta Circle code
            </label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Enter your code"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={redeeming}
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
              onKeyDown={e => { if (e.key === 'Enter' && code.trim()) handleRedeem() }}
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
            onClick={handleRedeem}
            disabled={!code.trim() || redeeming}
            style={{
              width: '100%',
              padding: '1rem',
              borderRadius: 14,
              fontWeight: 700,
              fontSize: '1rem',
              color: '#fff',
              backgroundColor: code.trim() && !redeeming ? 'var(--brand-orange)' : 'var(--border-strong)',
              border: 'none',
              cursor: code.trim() && !redeeming ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.15s',
            }}
          >
            {redeeming ? 'Unlocking…' : 'Unlock →'}
          </button>

          <p style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
            Invited by a parent or teacher? You're already in — just sign in from your invite link.
          </p>
        </div>
      </Card>
    )
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
              <Icon name={r.icon} size={22} style={{ color: 'var(--brand-orange)', flexShrink: 0 }} />
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

  // ── Step: Display-name soft confirm (only when the Google name looks off) ──
  if (step === 'name') {
    return (
      <Card>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.5rem' }}>
            Just checking — is this your name?
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Google gave us <strong>“{flaggedName || '(no name)'}”</strong>. BrainScribe uses
            your name when contacting your parent or teacher, so it should be your real one.
            You can fix it here.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: '1rem' }}>
          {[
            { label: 'First name', value: firstName, set: setFirstName, auto: 'given-name' },
            { label: 'Last name', value: lastName, set: setLastName, auto: 'family-name' },
          ].map(f => (
            <div key={f.label} style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--brand-navy)', marginBottom: 6 }}>
                {f.label}
              </label>
              <input
                type="text"
                value={f.value}
                onChange={e => f.set(e.target.value)}
                autoComplete={f.auto}
                disabled={savingName}
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
                onKeyDown={e => { if (e.key === 'Enter' && firstName.trim()) handleConfirmName() }}
              />
            </div>
          ))}
        </div>

        <button
          onClick={handleConfirmName}
          disabled={!firstName.trim() || savingName}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: 14,
            fontWeight: 700,
            fontSize: '1rem',
            color: '#fff',
            backgroundColor: firstName.trim() && !savingName ? 'var(--brand-orange)' : 'var(--border-strong)',
            border: 'none',
            cursor: firstName.trim() && !savingName ? 'pointer' : 'not-allowed',
            transition: 'background-color 0.15s',
          }}
        >
          {savingName ? 'Saving…' : 'Looks good, continue →'}
        </button>

        {error && (
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--status-error)', marginTop: '0.75rem' }}>
            {error}
          </p>
        )}
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
            { bracket: '13plus', label: "I'm 13 or older", icon: 'cap', desc: 'You can start using BrainScribe right away.' },
            { bracket: 'under13', label: "I'm under 13", icon: 'doc', desc: "We'll need a quick OK from your parent or guardian." },
          ].map(({ bracket, label, icon, desc }) => (
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
              <Icon name={icon} size={28} style={{ color: 'var(--brand-orange)', flexShrink: 0 }} />
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
            margin: '0 auto 1rem',
          }}>
            <Icon name="mail" size={28} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.5rem' }}>
            {UNDER13_SETUP_COPY.heading}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {UNDER13_SETUP_COPY.body}
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
              onKeyDown={e => { if (e.key === 'Enter' && parentEmail) handleRequestParentSetup() }}
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
            onClick={handleRequestParentSetup}
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
            {sendingEmail ? 'Sending…' : UNDER13_SETUP_COPY.cta}
          </button>

          <p style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
            If nobody sets it up within 7 days, we delete everything we&rsquo;ve collected.
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
