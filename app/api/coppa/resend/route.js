import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brainscribe.io'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await checkRateLimit(`coppa-resend:${user.id}`, 5, 3600)) {
    return rateLimited('Too many consent emails sent. Please try again later.')
  }

  const service = createServiceClient()

  // Find student profile + most recent pending record
  const { data: profile } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  const { data: pending } = await service
    .from('pending_coppa_signups')
    .select('id, token, parent_email, expires_at')
    .eq('student_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!pending) {
    return Response.json({ error: 'No pending consent request found' }, { status: 404 })
  }

  if (new Date(pending.expires_at) < new Date()) {
    // Mark expired
    await service
      .from('pending_coppa_signups')
      .update({ status: 'expired' })
      .eq('id', pending.id)
    return Response.json({ error: 'Consent request has expired' }, { status: 410 })
  }

  // Resend the email
  await sendConsentEmail({
    parentEmail: pending.parent_email,
    studentName: profile?.full_name ?? profile?.email ?? 'A student',
    token: pending.token,
    expiresAt: pending.expires_at,
  })

  return Response.json({ ok: true })
}

async function sendConsentEmail({ parentEmail, studentName, token, expiresAt }) {
  if (!process.env.RESEND_API_KEY) return

  const consentUrl = `${SITE_URL}/coppa/consent?token=${token}`
  const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
  const daysLeft = Math.max(1, Math.ceil(
    (new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24)
  ))

  const html = `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#211D17">
      <img src="${SITE_URL}/brainscribe-wordmark.png" alt="BrainScribe"
           style="height:32px;margin-bottom:28px" />

      <h2 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#14385A">
        Reminder: ${studentName} is waiting for your approval
      </h2>

      <p style="margin:0 0 16px;line-height:1.7;color:#4A4439">
        We sent you an approval request for ${studentName} to use BrainScribe.
        They're still waiting!
      </p>

      <div style="background:#FFF7ED;border:1px solid #F0811E;border-radius:12px;
                  padding:16px 20px;margin:24px 0">
        <p style="margin:0;font-size:13px;color:#7C2D12;line-height:1.6">
          <strong>⚠ This link expires ${expiryDate} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining).</strong><br>
          If not approved, ${studentName}'s account will be automatically deleted.
        </p>
      </div>

      <a href="${consentUrl}"
         style="display:inline-block;background:#F0811E;color:#fff;text-decoration:none;
                font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px;
                margin-bottom:28px">
        Review and approve →
      </a>

      <p style="margin:16px 0 0;font-size:12px;color:#8C8474">
        If you didn't expect this email, you can safely ignore it.
        No account will be created without your approval.
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
        to: parentEmail,
        subject: `Reminder: ${studentName} is waiting for your BrainScribe approval`,
        html,
      }),
    })
    if (!res.ok) {
      console.error('[coppa/resend] Resend error:', await res.text())
    }
  } catch (e) {
    console.error('[coppa/resend] Email send failed:', e)
  }
}
