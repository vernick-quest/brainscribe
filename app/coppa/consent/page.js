import { createServiceClient } from '@/lib/supabase/service'
import ConsentForm from './ConsentForm'
import Icon from '@/components/Icon'

export const metadata = { title: "Approve your child's account — BrainScribe" }

export default async function ConsentPage({ searchParams }) {
  const params = await searchParams
  const token = params.token

  if (!token) {
    return <ConsentError message="This link is missing a consent token. Please use the link from the email." />
  }

  const service = createServiceClient()

  // Validate the token
  const { data: pending } = await service
    .from('pending_coppa_signups')
    .select('id, student_id, parent_email, status, expires_at')
    .eq('token', token)
    .single()

  if (!pending) {
    return <ConsentError message="This approval link is invalid. Please check the email and try again, or contact brainscribe.io@gmail.com." />
  }

  if (pending.status === 'approved') {
    return <ConsentError
      message="This consent has already been given — your child's account is active."
      linkLabel="Go to your parent dashboard"
      linkHref="/parent"
      isSuccess
    />
  }

  if (pending.status === 'expired' || new Date(pending.expires_at) < new Date()) {
    // Mark as expired
    if (pending.status !== 'expired') {
      await service
        .from('pending_coppa_signups')
        .update({ status: 'expired' })
        .eq('id', pending.id)
    }
    return <ConsentError
      message="This approval link has expired. The student's account has been automatically deleted as required by COPPA. They can sign up again at brainscribe.io."
      linkLabel="Learn more about our privacy practices"
      linkHref="/privacy"
    />
  }

  // Fetch student info for display
  const { data: student } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', pending.student_id)
    .single()

  const daysLeft = Math.max(1, Math.ceil(
    (new Date(pending.expires_at) - new Date()) / (1000 * 60 * 60 * 24)
  ))

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--brand-cream)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
    }}>
      <div style={{
        backgroundColor: 'var(--surface-card)',
        borderRadius: 24,
        padding: '2.5rem',
        maxWidth: 480,
        width: '100%',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-default)',
      }}>

        {/* Logo */}
        <img
          src="/brainscribe-logo.png"
          alt="BrainScribe"
          style={{ width: 160, height: 'auto', marginBottom: '1.75rem', display: 'block', margin: '0 auto 1.75rem' }}
        />

        <h1 style={{
          fontSize: '1.35rem',
          fontWeight: 700,
          color: 'var(--text-strong)',
          marginBottom: '0.5rem',
          textAlign: 'center',
        }}>
          Your child wants to join BrainScribe
        </h1>

        <p style={{
          fontSize: '0.9rem',
          color: 'var(--text-muted)',
          lineHeight: 1.7,
          textAlign: 'center',
          marginBottom: '1.5rem',
        }}>
          BrainScribe is a voice-first writing coach that asks students questions to help
          them write in their own words. It doesn't write for them — it helps them think.
        </p>

        {/* Expiry notice */}
        <div style={{
          backgroundColor: 'var(--surface-spark)',
          border: '1px solid var(--border-default)',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: '1.5rem',
          fontSize: '0.82rem',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}>
          This link expires in <strong>{daysLeft} day{daysLeft !== 1 ? 's' : ''}</strong>.
        </div>

        <ConsentForm
          token={token}
          studentName={student?.full_name}
          studentEmail={student?.email ?? pending.parent_email}
        />

      </div>

      <p style={{
        marginTop: '1.5rem',
        fontSize: '0.8rem',
        color: 'var(--text-subtle)',
        textAlign: 'center',
      }}>
        Questions? <a href="mailto:brainscribe.io@gmail.com" style={{ color: 'var(--brand-orange)' }}>brainscribe.io@gmail.com</a>
        {' · '}
        <a href="/privacy" style={{ color: 'var(--text-subtle)' }}>Privacy Policy</a>
      </p>
    </div>
  )
}

function ConsentError({ message, linkLabel, linkHref, isSuccess }) {
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
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
          {isSuccess ? '✓' : <Icon name="alert" size={36} style={{ color: 'var(--status-error)' }} />}
        </div>
        <p style={{
          fontSize: '0.95rem',
          lineHeight: 1.7,
          color: 'var(--text-body)',
          marginBottom: linkLabel ? '1.5rem' : 0,
        }}>
          {message}
        </p>
        {linkLabel && (
          <a href={linkHref} style={{
            display: 'inline-block',
            backgroundColor: isSuccess ? 'var(--brand-orange)' : 'var(--brand-navy)',
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
