import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Icon from '@/components/Icon'
import { validateConsentBinding, escapeHtml } from '@/lib/coppa'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brainscribe.io'

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
    .select('id, student_id, parent_email, status, expires_at')
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

  // Fetch student profile for the activation email
  const { data: student } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', pending.student_id)
    .single()

  // ── Process approval ─────────────────────────────────────────────────────────

  // 1. Mark pending record as approved (status-guarded so a double-open can't
  //    re-run the approval transaction).
  await service
    .from('pending_coppa_signups')
    .update({ status: 'approved' })
    .eq('id', pending.id)
    .eq('status', 'pending')

  // 2. Update the signer's profile (ensure role='parent', role_confirmed=true) —
  //    but NEVER demote an admin: an admin approving a consent link must keep
  //    their admin role, or approving would lock them out of /admin.
  await service
    .from('profiles')
    .update({
      ...(parentCurrentProfile?.role === 'admin' ? {} : { role: 'parent' }),
      role_confirmed: true,
      age_bracket: '13plus',  // must be 13+ to be a consenting parent
    })
    .eq('id', user.id)

  // 3. Grant student access
  await service
    .from('profiles')
    .update({
      coppa_consent_given: true,
      coppa_consent_given_at: new Date().toISOString(),
      coppa_consent_parent_id: user.id,
    })
    .eq('id', pending.student_id)

  // 4. Create parent→student relationship (ignore if already exists)
  await service
    .from('relationships')
    .upsert(
      { watcher_id: user.id, student_id: pending.student_id },
      { onConflict: 'watcher_id,student_id', ignoreDuplicates: true }
    )

  // 5. Log the consent (audit trail). COPPA requires recording the parent's IP and
  //    device at the moment of consent — capture them from the request headers.
  const hdrs = await headers()
  const ipAddress = (hdrs.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  const userAgent = hdrs.get('user-agent') || null
  await service
    .from('coppa_consent_log')
    .insert({
      student_id: pending.student_id,
      parent_id: user.id,
      pending_id: pending.id,
      consent_method: 'email_approval',
      ip_address: ipAddress,
      user_agent: userAgent,
      privacy_policy_version: 'v1.0-june-2025',
    })

  // 6. Send student "you're approved!" email
  await sendApprovalEmail({
    studentEmail: student?.email,
    studentName: student?.full_name,
  })

  // ── Done — redirect parent to their new dashboard ────────────────────────────
  redirect('/parent')
}

async function sendApprovalEmail({ studentEmail, studentName }) {
  if (!studentEmail || !process.env.RESEND_API_KEY) return

  // full_name is client-writable — escape before HTML interpolation.
  const firstName = escapeHtml(studentName?.split(' ')[0] ?? 'there')

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#211D17">
      <img src="${SITE_URL}/brainscribe-wordmark.png" alt="BrainScribe"
           style="height:32px;margin-bottom:28px" />

      <h2 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#14385A">
        You're approved, ${firstName}! 🎉
      </h2>

      <p style="margin:0 0 16px;line-height:1.7;color:#4A4439">
        Great news — your parent approved your BrainScribe account.
        You can now sign in and start working on your assignments.
      </p>

      <a href="${SITE_URL}/login"
         style="display:inline-block;background:#F0811E;color:#fff;text-decoration:none;
                font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px;
                margin-bottom:28px">
        Sign in to BrainScribe →
      </a>

      <p style="margin:0;font-size:13px;color:#6B6358;line-height:1.6">
        Your parent can see your session progress in their dashboard.
        Your words are always your own — BrainScribe just asks the questions.
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BrainScribe <notifications@brainscribe.io>',
        to: studentEmail,
        subject: "You're approved! Sign in to BrainScribe",
        html,
      }),
    })
    if (!res.ok) {
      console.error('[coppa/complete] Resend error:', await res.text())
    }
  } catch (e) {
    console.error('[coppa/complete] Email send failed:', e)
  }
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
