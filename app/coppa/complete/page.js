import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import Icon from '@/components/Icon'
import { validateConsentBinding } from '@/lib/coppa'
import { generateConfirmToken, shouldResendConfirm, sendSecondStepConfirmEmail } from '@/lib/coppaConsent'

export const metadata = { title: 'Setting up your account — BrainScribe' }

export default async function CoppaCompletePage({ searchParams }) {
  const params = await searchParams
  const token = params.token

  if (!token) redirect('/login')

  // Parent must be logged in (just completed OAuth)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/coppa/consent?token=${token}`)

  const service = createServiceClient()

  // Validate token
  const { data: pending } = await service
    .from('pending_coppa_signups')
    .select('id, student_id, parent_email, status, expires_at, first_step_at, confirm_token, confirm_sent_at')
    .eq('token', token)
    .single()

  if (!pending) {
    return <ErrorPage message="This consent link is invalid." />
  }

  // If already approved, just redirect parent to their dashboard
  if (pending.status === 'approved') {
    redirect('/parent')
  }

  if (pending.status === 'expired' || new Date(pending.expires_at) < new Date()) {
    await service
      .from('pending_coppa_signups')
      .update({ status: 'expired' })
      .eq('id', pending.id)
    return <ErrorPage message="This consent link has expired. The student's account has been deleted. They can sign up again at brainscribe.io." />
  }

  const { data: parentCurrentProfile } = await service
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  // Consent binding (lib/coppa.js): the signer must not be a student account, must
  // not be the student being approved, and must be signed in as EXACTLY the email
  // the consent request was sent to — that's what makes the consent verifiable.
  const binding = validateConsentBinding({
    signerId: user.id,
    signerEmail: user.email,
    signerRole: parentCurrentProfile?.role,
    pending,
  })
  if (!binding.ok) {
    const copy = {
      student_account: {
        message: "The Google account you signed in with appears to be a student account on BrainScribe. Please sign in with a parent or guardian's Google account instead.",
        linkLabel: 'Try again with a different account',
      },
      self_consent: {
        message: "This account can't approve itself. A parent or guardian must approve from their own Google account.",
        linkLabel: 'Use a different account',
      },
      email_mismatch: {
        message: `This approval was sent to ${maskEmail(pending.parent_email)}. Please sign in with that Google account to approve — that's how we confirm a parent or guardian gave consent.`,
        linkLabel: 'Sign in with the right account',
      },
    }[binding.code]
    return (
      <ErrorPage
        message={copy.message}
        linkLabel={copy.linkLabel}
        linkHref={`/coppa/consent?token=${token}`}
      />
    )
  }

  // ── STEP 1 of email-plus VPC — DO NOT grant consent here ─────────────────────
  // The email-match + OAuth above is only the FIRST step. Consent is granted only
  // after the parent acts on a SECOND confirmation email (/coppa/confirm). Here we:
  // set the signer's parent role, mark step 1 done, and send the confirm email.

  // Ensure the signer is a confirmed parent (never demote an admin — approving must
  // not lock them out of /admin). Safe to do at step 1: they proved the email.
  await service
    .from('profiles')
    .update({
      ...(parentCurrentProfile?.role === 'admin' ? {} : { role: 'parent' }),
      role_confirmed: true,
      age_bracket: '13plus',  // must be 13+ to be a consenting parent
    })
    .eq('id', user.id)

  const { data: student } = await service
    .from('profiles').select('full_name').eq('id', pending.student_id).single()

  // First visit: stamp step 1 + mint a confirm token + send the second email.
  // Re-visit (parent reloaded): re-send only if throttle allows. status stays
  // 'pending' the whole time — consent is set only at /coppa/confirm.
  let confirmToken = pending.confirm_token
  if (!pending.first_step_at) {
    confirmToken = generateConfirmToken()
    await service
      .from('pending_coppa_signups')
      .update({ first_step_at: new Date().toISOString(), confirm_token: confirmToken, confirm_sent_at: new Date().toISOString() })
      .eq('id', pending.id)
      .eq('status', 'pending')
    await sendSecondStepConfirmEmail({ parentEmail: pending.parent_email, studentName: student?.full_name, confirmToken })
  } else if (shouldResendConfirm(pending.confirm_sent_at)) {
    if (!confirmToken) {
      confirmToken = generateConfirmToken()
      await service.from('pending_coppa_signups').update({ confirm_token: confirmToken }).eq('id', pending.id)
    }
    await service.from('pending_coppa_signups').update({ confirm_sent_at: new Date().toISOString() }).eq('id', pending.id)
    await sendSecondStepConfirmEmail({ parentEmail: pending.parent_email, studentName: student?.full_name, confirmToken })
  }

  return <CheckEmailPage parentEmail={pending.parent_email} />
}

// The parent has done step 1 — tell them to check their inbox for the confirm link.
function CheckEmailPage({ parentEmail }) {
  return (
    <InfoPage
      title="One more step — check your email"
      message={`To keep kids safe, we confirm consent in two steps. We just sent a confirmation link to ${maskEmail(parentEmail)}. Open it to activate the account — until then, the account stays inactive.`}
    />
  )
}

// Mask the invited email in error copy so the page doesn't disclose the full
// address to whoever opened the link (e.g. "j••••@gmail.com").
function maskEmail(email) {
  if (!email || !email.includes('@')) return 'the parent email on file'
  const [local, domain] = email.split('@')
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(local.length - 1, 2))}@${domain}`
}

function ErrorPage({ message, linkLabel, linkHref }) {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--brand-cream)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <div style={{
        backgroundColor: 'var(--surface-card)',
        borderRadius: 24,
        padding: '2.5rem',
        maxWidth: 440,
        width: '100%',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-default)',
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: '1rem' }}><Icon name="alert" size={36} style={{ color: 'var(--status-error)' }} /></div>
        <p style={{
          fontSize: '0.95rem',
          lineHeight: 1.7,
          color: 'var(--text-body)',
          marginBottom: linkLabel ? '1.5rem' : 0,
        }}>
          {message}
        </p>
        {linkLabel && linkHref && (
          <a href={linkHref} style={{
            display: 'inline-block',
            backgroundColor: 'var(--brand-orange)',
            color: '#fff',
            padding: '10px 22px',
            borderRadius: 10,
            fontSize: '0.875rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}>
            {linkLabel}
          </a>
        )}
      </div>
    </div>
  )
}

// Neutral info card (email-plus step-1 confirmation) — no alarm styling.
function InfoPage({ title, message }) {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--brand-cream)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <div style={{
        backgroundColor: 'var(--surface-card)',
        borderRadius: 24,
        padding: '2.5rem',
        maxWidth: 440,
        width: '100%',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-default)',
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: '1rem' }}><Icon name="mail" size={36} style={{ color: 'var(--accent-text)' }} /></div>
        <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.75rem' }}>{title}</h1>
        <p style={{ fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--text-body)' }}>{message}</p>
      </div>
    </div>
  )
}
