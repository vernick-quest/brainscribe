import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { isValidEmail, escapeHtml } from '@/lib/coppa'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brainscribe.io'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Sends a branded email to a user-supplied address — cap it tightly.
  if (!await checkRateLimit(`coppa-initiate:${user.id}`, 5, 3600)) {
    return rateLimited('Too many consent emails sent. Please try again later.')
  }

  const { parentEmail } = await request.json()

  if (!isValidEmail(parentEmail)) {
    return Response.json({ error: 'Valid parent email required' }, { status: 400 })
  }

  // The student's own address can't receive parental consent — /coppa/complete
  // would reject the self-signer anyway (signer ≠ student), so fail it here with
  // a clear message instead of sending a dead-end email.
  if (parentEmail.trim().toLowerCase() === (user.email ?? '').toLowerCase()) {
    return Response.json({ error: "That's your own email — enter a parent or guardian's address." }, { status: 400 })
  }

  const service = createServiceClient()

  // Fetch student profile to confirm coppa_consent_required
  const { data: profile } = await service
    .from('profiles')
    .select('full_name, email, coppa_consent_required, coppa_consent_given')
    .eq('id', user.id)
    .single()

  if (!profile?.coppa_consent_required) {
    return Response.json({ error: 'COPPA consent not required for this account' }, { status: 400 })
  }

  if (profile.coppa_consent_given) {
    return Response.json({ error: 'Consent already granted' }, { status: 400 })
  }

  // Check for an existing pending (non-expired) record to avoid duplicates
  const { data: existing } = await service
    .from('pending_coppa_signups')
    .select('id, token, expires_at')
    .eq('student_id', user.id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  let pending = existing

  if (!pending) {
    // Create a fresh pending record
    const { data: newPending, error } = await service
      .from('pending_coppa_signups')
      .insert({ student_id: user.id, parent_email: parentEmail })
      .select('id, token, expires_at')
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    pending = newPending
  } else {
    // Update parent email in case they changed it
    await service
      .from('pending_coppa_signups')
      .update({ parent_email: parentEmail })
      .eq('id', pending.id)
  }

  // Send consent email to parent
  await sendConsentEmail({
    parentEmail,
    studentName: profile.full_name ?? profile.email ?? 'A student',
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
  const daysLeft = Math.ceil(
    (new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24)
  )
  const firstName = (studentName || '').trim().split(/\s+/)[0] || 'your child'
  // full_name is client-writable — escape it, or a student could inject markup
  // into the consent email their parent trusts.
  const safeName = escapeHtml(studentName)
  const safeFirst = escapeHtml(firstName)

  const divider = `<hr style="border:none;border-top:1px solid #E7DECB;margin:24px 0" />`

  const html = `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#211D17">
      <img src="${SITE_URL}/brainscribe-wordmark.png" alt="BrainScribe"
           style="height:32px;margin-bottom:28px" />

      <h2 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#14385A">
        ${safeName} wants to use BrainScribe
      </h2>

      <p style="margin:0 0 16px;line-height:1.7;color:#4A4439">
        BrainScribe is a writing coach designed for students who struggle to get
        their ideas on paper — including students with ADHD and executive function
        challenges. It asks coaching questions, the student talks through their
        answers, and their words become their writing. It never writes for them.
      </p>

      <p style="margin:0 0 16px;line-height:1.7;color:#4A4439">
        Since ${safeName} is under 13, we need your approval before they can
        start. <strong>This is completely free — no credit card required.</strong>
      </p>

      <div style="background:#FFF7ED;border:1px solid #F0811E;border-radius:12px;
                  padding:16px 20px;margin:24px 0">
        <p style="margin:0;font-size:13px;color:#7C2D12;line-height:1.6">
          <strong>⚠ This link expires ${expiryDate} (${daysLeft} days from now).</strong><br>
          If not approved by then, ${safeName}'s account request will be automatically deleted.
        </p>
      </div>

      <a href="${consentUrl}"
         style="display:inline-block;background:#F0811E;color:#fff;text-decoration:none;
                font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px;
                margin-bottom:8px">
        Approve ${safeFirst}'s account →
      </a>

      ${divider}

      <p style="margin:0 0 12px;font-size:13px;color:#4A4439;line-height:1.6">
        <strong>What we collect:</strong> Session transcripts and the paragraphs your
        child writes. You can view or delete these at any time from your parent
        dashboard once you approve.
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#4A4439;line-height:1.6">
        <strong>What we don't do:</strong> Sell student data, advertise to students,
        or share session content with third parties.
      </p>
      <p style="margin:0;font-size:13px;color:#6B6358;line-height:1.6">
        <a href="${SITE_URL}/privacy" style="color:#F0811E">Read our full privacy policy →</a>
      </p>

      ${divider}

      <p style="margin:0;font-size:12px;color:#8C8474;line-height:1.6">
        If you didn't expect this email, you can safely ignore it.
        No account will be created without your approval.
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#8C8474">
        — The BrainScribe team<br>
        <a href="${SITE_URL}" style="color:#8C8474">brainscribe.io</a>
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
        reply_to: 'brainscribe.io@gmail.com',
        to: parentEmail,
        subject: `Quick approval needed for ${firstName}'s BrainScribe account`,
        html,
      }),
    })
    if (!res.ok) {
      console.error('[coppa/initiate] Resend error:', await res.text())
    }
  } catch (e) {
    console.error('[coppa/initiate] Email send failed:', e)
  }
}
