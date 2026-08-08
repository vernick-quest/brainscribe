import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { isValidEmail, escapeHtml } from '@/lib/coppa'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brainscribe.io'

// POST /api/coppa/request-parent-setup — the under-13 dead end.
//
// Replaces /api/coppa/initiate for NEW signups. The difference is the entire point:
//
//   initiate            creates a pending_coppa_signups row with a TOKEN, and emails a
//                       link that GRANTS CONSENT on the child's existing account.
//   request-parent-setup creates NOTHING approvable. It emails the parent an invitation to
//                       create THEIR OWN account. The child cannot cause their own access.
//
// Fable red-team #3 (code-traced): a minor with a second email could satisfy every check
// in the email-plus flow, because there was always something pending for them to approve.
// Removing the approvable object is the fix; hardening the check was not.
//
// COPPA note: collecting a parent's email FROM a child is permitted for the purpose of
// contacting that parent. It must not be used for anything else, and it must be deleted if
// setup isn't completed — the existing 7-day under-13 cleanup cron covers that, since no
// pending row is created here and the child's own record is swept on the same schedule.
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Sends mail to a user-supplied address — cap it tightly, same as initiate.
  if (!await checkRateLimit(`coppa-parent-setup:${user.id}`, 5, 3600)) {
    return rateLimited('Too many emails sent. Please try again later.')
  }

  const { parentEmail } = await request.json()
  if (!isValidEmail(parentEmail)) {
    return Response.json({ error: 'Valid parent email required' }, { status: 400 })
  }

  // A child pointing this at their own inbox is the attack, not an accident.
  if (parentEmail.trim().toLowerCase() === (user.email ?? '').toLowerCase()) {
    return Response.json(
      { error: "That's your own email — enter a parent or guardian's address." },
      { status: 400 },
    )
  }

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('full_name, email, coppa_consent_required, coppa_consent_given')
    .eq('id', user.id)
    .single()

  if (!profile?.coppa_consent_required) {
    return Response.json({ error: 'Not applicable for this account' }, { status: 400 })
  }
  if (profile.coppa_consent_given) {
    return Response.json({ error: 'Already set up' }, { status: 400 })
  }

  // Recorded ONLY so we can contact them and so a later cleanup can find it. Deliberately
  // NOT a pending_coppa_signups row: that table's rows carry a consent token, and the
  // whole point here is that no such token exists.
  await service
    .from('profiles')
    .update({ pending_parent_email: parentEmail.trim().toLowerCase() })
    .eq('id', user.id)

  await sendParentSetupEmail({
    parentEmail,
    childName: profile.full_name ?? profile.email ?? 'Your child',
    childEmail: profile.email ?? '',
  })

  return Response.json({ ok: true })
}

async function sendParentSetupEmail({ parentEmail, childName, childEmail }) {
  if (!process.env.RESEND_API_KEY) return

  const firstName = (childName || '').trim().split(/\s+/)[0] || 'your child'
  // full_name is client-writable — escape it, or a child could inject markup into the
  // email their parent trusts.
  const safeFirst = escapeHtml(firstName)
  const safeChildEmail = escapeHtml(childEmail)
  // Lands on normal PARENT signup, never on a consent-approval route. There is no token in
  // this URL and nothing here can grant a child access.
  const setupUrl = `${SITE_URL}/login?role=parent`

  const html = `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#211D17">
      <img src="${SITE_URL}/brainscribe-wordmark.png" alt="BrainScribe"
           style="height:32px;margin-bottom:28px" />

      <h2 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#14385A">
        ${safeFirst} would like to use BrainScribe
      </h2>

      <p style="margin:0 0 16px;line-height:1.7;color:#4A4439">
        BrainScribe is a writing coach for students who struggle to get their ideas onto
        paper — including students with ADHD and executive function challenges. It asks
        coaching questions, your child talks through their answers, and their own words
        become their writing. It never writes for them.
      </p>

      <p style="margin:0 0 16px;line-height:1.7;color:#4A4439">
        Because ${safeFirst} is under 13, <strong>you set the account up, not them.</strong>
        Create your parent account and add them from your dashboard — it takes a minute, and
        it's free.
      </p>

      <a href="${setupUrl}"
         style="display:inline-block;background:#F0811E;color:#fff;text-decoration:none;
                font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px;
                margin-bottom:8px">
        Set up ${safeFirst}'s account →
      </a>

      <p style="margin:16px 0 0;font-size:13px;color:#4A4439;line-height:1.6">
        When you add them, use <strong>${safeChildEmail}</strong> — that's the address they
        signed in with, so everything will be waiting for them.
      </p>

      <hr style="border:none;border-top:1px solid #E7DECB;margin:24px 0" />

      <p style="margin:0 0 12px;font-size:13px;color:#4A4439;line-height:1.6">
        <strong>What we collect:</strong> Session transcripts and the paragraphs your child
        writes. You can read or delete these at any time from your parent dashboard.
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#4A4439;line-height:1.6">
        <strong>What we don't do:</strong> Sell student data, advertise to students, or
        share session content with third parties.
      </p>
      <p style="margin:0;font-size:13px;color:#6B6358;line-height:1.6">
        <a href="${SITE_URL}/privacy" style="color:#F0811E">Read our full privacy policy →</a>
      </p>

      <hr style="border:none;border-top:1px solid #E7DECB;margin:24px 0" />

      <p style="margin:0;font-size:12px;color:#8C8474;line-height:1.6">
        If you weren't expecting this, you can ignore it. Your child has no access to
        BrainScribe, and nothing happens unless you set the account up yourself.
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
        subject: `Set up ${firstName}'s BrainScribe account`,
        html,
      }),
    })
    if (!res.ok) console.error('[coppa/request-parent-setup] Resend error:', await res.text())
  } catch (e) {
    console.error('[coppa/request-parent-setup] Email send failed:', e)
  }
}
