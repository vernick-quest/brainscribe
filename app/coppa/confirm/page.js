import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Icon from '@/components/Icon'
import { validateConsentBinding, isValidConsentToken } from '@/lib/coppa'
import { grantConsentForPending, sendStudentApprovalEmail } from '@/lib/coppaConsent'
import CoppaConfirmButton from './CoppaConfirmButton'

export const metadata = { title: 'Confirm approval — BrainScribe' }

// STEP 2 of the email-plus VPC. The parent reached here from the SECOND
// confirmation email. Only here is consent actually granted. Works for both origin
// paths (the /coppa email flow and the birthdate bootstrap): both stamp a
// confirm_token + first_step_at on the pending row; this page grants once the
// parent confirms as the invited email.
export default async function CoppaConfirmPage({ searchParams }) {
  const params = await searchParams
  const token = params.token

  if (!token || !isValidConsentToken(token)) {
    return <ErrorPage message="This confirmation link is invalid." />
  }

  const service = createServiceClient()

  const { data: pending } = await service
    .from('pending_coppa_signups')
    .select('id, student_id, parent_email, status, expires_at, first_step_at')
    .eq('confirm_token', token)
    .single()

  if (!pending) return <ErrorPage message="This confirmation link is invalid." />
  if (pending.status === 'approved') redirect('/parent')  // already confirmed
  if (!pending.first_step_at) {
    // Reached confirm without step 1 (shouldn't happen) — send them back to start.
    return <ErrorPage message="Please open the first approval link before confirming." linkLabel="Go to sign in" linkHref="/login" />
  }
  if (pending.status === 'expired' || new Date(pending.expires_at) < new Date()) {
    await service.from('pending_coppa_signups').update({ status: 'expired' }).eq('id', pending.id)
    return <ErrorPage message="This approval link has expired. The student's account request has been removed. They can sign up again at brainscribe.io." />
  }

  // Parent must be signed in as the invited email to confirm. If not signed in,
  // offer Google sign-in that returns here (mirrors the /coppa/consent step).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return <ConfirmSignInPage token={token} />
  }

  const { data: signerProfile } = await service
    .from('profiles').select('role').eq('id', user.id).single()

  // Re-validate the consent binding at the moment of the grant — the confirmer
  // must be the invited parent, not the student, not a student account.
  const binding = validateConsentBinding({
    signerId: user.id,
    signerEmail: user.email,
    signerRole: signerProfile?.role,
    pending,
  })
  if (!binding.ok) {
    return (
      <ErrorPage
        message="This confirmation must be completed by the parent or guardian the approval was sent to. Please sign in with that Google account."
        linkLabel="Use a different account"
        linkHref={`/coppa/confirm?token=${token}`}
      />
    )
  }

  const hdrs = await headers()
  const ip = (hdrs.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  const userAgent = hdrs.get('user-agent') || null

  const result = await grantConsentForPending(service, {
    pending, parentUserId: user.id, ip, userAgent, method: 'email_plus',
  })
  if (!result.ok) {
    return <ErrorPage message="Something went wrong activating the account. Please try the link again, or contact brainscribe.io@gmail.com." />
  }
  if (!result.alreadyDone) {
    await sendStudentApprovalEmail({ studentEmail: result.student?.email, studentName: result.student?.full_name })
  }

  redirect('/parent')
}

function ConfirmSignInPage({ token }) {
  return (
    <Shell>
      <div style={{ marginBottom: '1rem' }}><Icon name="lock" size={36} style={{ color: 'var(--accent-text)' }} /></div>
      <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '0.5rem' }}>
        Confirm your approval
      </h1>
      <p style={{ fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--text-body)', marginBottom: '1.5rem' }}>
        This is the final step. Sign in with the same parent Google account to
        activate the account.
      </p>
      <CoppaConfirmButton token={token} />
    </Shell>
  )
}

function ErrorPage({ message, linkLabel, linkHref }) {
  return (
    <Shell>
      <div style={{ marginBottom: '1rem' }}><Icon name="alert" size={36} style={{ color: 'var(--status-error)' }} /></div>
      <p style={{ fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--text-body)', marginBottom: linkLabel ? '1.5rem' : 0 }}>
        {message}
      </p>
      {linkLabel && linkHref && (
        <a href={linkHref} style={{
          display: 'inline-block', backgroundColor: 'var(--brand-orange)', color: '#fff',
          padding: '10px 22px', borderRadius: 10, fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none',
        }}>{linkLabel}</a>
      )}
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh', backgroundColor: 'var(--brand-cream)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem',
    }}>
      <div style={{
        backgroundColor: 'var(--surface-card)', borderRadius: 24, padding: '2.5rem',
        maxWidth: 440, width: '100%', boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-default)', textAlign: 'center',
      }}>
        {children}
      </div>
    </div>
  )
}
