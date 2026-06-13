import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import PendingActions from './PendingActions'

export const metadata = { title: 'Waiting for approval — BrainScribe' }

export default async function CoppaPendingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  // Check profile flags
  const { data: profile } = await service
    .from('profiles')
    .select('coppa_consent_required, coppa_consent_given, full_name')
    .eq('id', user.id)
    .single()

  // If consent isn't required or already given, send to dashboard
  if (!profile?.coppa_consent_required) redirect('/dashboard')
  if (profile?.coppa_consent_given) redirect('/dashboard')

  // Fetch the most recent pending record
  const { data: pending } = await service
    .from('pending_coppa_signups')
    .select('parent_email, expires_at, status')
    .eq('student_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  // Calculate days remaining
  let daysLeft = null
  let expiryDate = null
  if (pending?.expires_at) {
    daysLeft = Math.max(0, Math.ceil(
      (new Date(pending.expires_at) - new Date()) / (1000 * 60 * 60 * 24)
    ))
    expiryDate = new Date(pending.expires_at).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric',
    })
  }

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
        textAlign: 'center',
      }}>

        {/* Logo */}
        <img
          src="/brainscribe-logo.png"
          alt="BrainScribe"
          style={{ width: 160, height: 'auto', marginBottom: '1.75rem' }}
        />

        {/* Status icon */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          backgroundColor: 'var(--surface-spark)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          margin: '0 auto 1.5rem',
        }}>
          📬
        </div>

        <h1 style={{
          fontSize: '1.4rem',
          fontWeight: 700,
          color: 'var(--text-strong)',
          marginBottom: '0.75rem',
        }}>
          Check your parent's inbox, {firstName}
        </h1>

        {pending ? (
          <>
            <p style={{
              fontSize: '0.95rem',
              lineHeight: 1.7,
              color: 'var(--text-muted)',
              marginBottom: '1.5rem',
            }}>
              We sent an approval email to{' '}
              <strong style={{ color: 'var(--text-body)' }}>{pending.parent_email}</strong>.
              Once your parent clicks the link in that email, you're in!
            </p>

            {/* Countdown */}
            {daysLeft !== null && (
              <div style={{
                backgroundColor: daysLeft <= 2 ? 'var(--status-error-bg)' : 'var(--surface-spark)',
                border: `1px solid ${daysLeft <= 2 ? 'var(--status-error)' : 'var(--border-default)'}`,
                borderRadius: 12,
                padding: '14px 18px',
                marginBottom: '1.5rem',
              }}>
                <p style={{
                  fontSize: '0.875rem',
                  color: daysLeft <= 2 ? 'var(--status-error)' : 'var(--text-body)',
                  fontWeight: 600,
                  margin: 0,
                }}>
                  {daysLeft === 0
                    ? '⚠ Expires today — ask your parent to check their email!'
                    : daysLeft === 1
                    ? '⚠ 1 day left until this request expires'
                    : `${daysLeft} days left to approve (by ${expiryDate})`}
                </p>
                {daysLeft <= 7 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    If your parent doesn't approve by then, your account will be
                    automatically deleted. You can always sign up again!
                  </p>
                )}
              </div>
            )}

            {/* Resend + sign out */}
            <PendingActions parentEmail={pending.parent_email} daysLeft={daysLeft} />
          </>
        ) : (
          <>
            <p style={{
              fontSize: '0.95rem',
              lineHeight: 1.7,
              color: 'var(--text-muted)',
              marginBottom: '1.5rem',
            }}>
              It looks like we don't have a pending consent request for your account.
              Please contact <strong>brainscribe.io@gmail.com</strong> for help.
            </p>
            <a href="/api/auth/signout"
              style={{ fontSize: '0.875rem', color: 'var(--brand-orange)', fontWeight: 600 }}>
              Sign out
            </a>
          </>
        )}

      </div>

      {/* Tips */}
      <div style={{
        maxWidth: 480,
        width: '100%',
        marginTop: '1.5rem',
        padding: '1.25rem 1.5rem',
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 14,
      }}>
        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Tips
        </p>
        <ul style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
          <li>Ask your parent to check their spam or junk folder.</li>
          <li>Make sure you gave us the right email address.</li>
          <li>If they can't find it, use the "Resend email" button above.</li>
        </ul>
      </div>
    </div>
  )
}
