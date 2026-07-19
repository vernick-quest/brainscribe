import { randomBytes } from 'crypto'
import { escapeHtml } from '@/lib/coppa'

// lib/coppaConsent.js — the shared "email-plus" verifiable-parental-consent grant.
//
// COPPA VPC HARDENING (decision (c), child-safety package): a single email match no
// longer grants consent. Consent requires TWO steps:
//   step 1  — the parent proves the invited email (OAuth email-match in
//             /coppa/complete, OR the in-app birthdate-correction action);
//   step 2  — the parent acts on a SECOND, separately-sent confirmation email
//             (/coppa/confirm) before `profiles.coppa_consent_given` is ever set.
// This is the FTC "email-plus" method (email consent + an additional confirming
// step). ⚠️ Counsel must confirm this specific mechanism QUALIFIES as VPC — this
// module builds the mechanism, it does not assert legal sufficiency.
//
// Second-step state lives in NEW nullable columns on pending_coppa_signups
// (confirm_token / first_step_at / confirm_sent_at / confirmed_at) — status stays
// 'pending' until the grant, so /coppa/pending and the 7-day cleanup cron are
// unaffected (an un-confirmed request still expires + is deleted, fail-safe).
// All writes are SERVICE-ROLE (gate columns are REVOKEd from `authenticated` by
// migration 020). Requires the ADD-COLUMN migration handed to the conductor.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brainscribe.io'

// 48 hex chars — same shape as the DB-default first-step token; passes
// isValidConsentToken() in lib/coppa.js.
export function generateConfirmToken() {
  return randomBytes(24).toString('hex')
}

// Throttle re-sends of the confirmation email (the confirm page can be reloaded).
export function shouldResendConfirm(confirmSentAt) {
  if (!confirmSentAt) return true
  return Date.now() - new Date(confirmSentAt).getTime() > 2 * 60 * 1000
}

// STEP 2 — the actual consent grant, shared by /coppa/confirm for both origin
// paths (the /coppa email flow and the birthdate bootstrap). Status-guarded so a
// double-click can't double-run. Returns { ok, alreadyDone, student }.
export async function grantConsentForPending(service, { pending, parentUserId, ip = null, userAgent = null, method = 'email_plus' }) {
  // Atomically claim the pending row: pending → approved, only if still pending.
  const { data: claimed, error: claimErr } = await service
    .from('pending_coppa_signups')
    .update({ status: 'approved', confirmed_at: new Date().toISOString() })
    .eq('id', pending.id)
    .eq('status', 'pending')
    .select('id')
  if (claimErr) return { ok: false, error: claimErr.message }
  if (!claimed?.length) {
    // Someone already approved it (double-open) — treat as done, don't re-grant.
    return { ok: true, alreadyDone: true }
  }

  // Grant the student access (service-role: gate columns are 020-locked).
  await service
    .from('profiles')
    .update({
      coppa_consent_given: true,
      coppa_consent_given_at: new Date().toISOString(),
      coppa_consent_parent_id: parentUserId,
    })
    .eq('id', pending.student_id)

  // Parent → student oversight link (idempotent).
  await service
    .from('relationships')
    .upsert(
      { watcher_id: parentUserId, student_id: pending.student_id },
      { onConflict: 'watcher_id,student_id', ignoreDuplicates: true }
    )

  // Audit the consent event at the moment it is actually granted (step 2).
  await service
    .from('coppa_consent_log')
    .insert({
      student_id: pending.student_id,
      parent_id: parentUserId,
      pending_id: pending.id,
      consent_method: method,
      ip_address: ip,
      user_agent: userAgent,
      privacy_policy_version: 'v1.0-june-2025',
    })

  const { data: student } = await service
    .from('profiles').select('full_name, email').eq('id', pending.student_id).single()

  return { ok: true, student }
}

// The SECOND-STEP confirmation email (step 1 → parent). Its link is the "plus".
export async function sendSecondStepConfirmEmail({ parentEmail, studentName, confirmToken }) {
  if (!process.env.RESEND_API_KEY) return
  const confirmUrl = `${SITE_URL}/coppa/confirm?token=${confirmToken}`
  const safeName = escapeHtml(studentName || 'your child')

  const html = `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#211D17">
      <img src="${SITE_URL}/brainscribe-wordmark.png" alt="BrainScribe" width="124" height="40" style="display:block;width:124px;height:40px;border:0;margin-bottom:28px" />
      <h2 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#14385A">
        One more step to approve ${safeName}
      </h2>
      <p style="margin:0 0 16px;line-height:1.7;color:#4A4439">
        Thanks — we received your approval. To finish and activate ${safeName}'s
        BrainScribe account, please confirm once more using the button below. We ask
        for this second step to be sure a parent or guardian — not the child — is
        giving consent.
      </p>
      <a href="${confirmUrl}"
         style="display:inline-block;background:#F0811E;color:#fff;text-decoration:none;
                font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px;margin-bottom:20px">
        Confirm and activate the account →
      </a>
      <p style="margin:0;font-size:13px;color:#6B6358;line-height:1.6">
        ${safeName}'s account stays inactive until you confirm. If you didn't request
        this, you can ignore this email and no account will be activated.
      </p>
    </div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'BrainScribe <notifications@brainscribe.io>',
        reply_to: 'brainscribe.io@gmail.com',
        to: parentEmail,
        subject: `One more step to approve ${(studentName || 'your child')}'s BrainScribe account`,
        html,
      }),
    })
    if (!res.ok) console.error('[coppa/second-step] Resend error:', await res.text())
  } catch (e) {
    console.error('[coppa/second-step] Email send failed:', e)
  }
}

// The student "you're approved" email (sent after step 2 grants consent).
export async function sendStudentApprovalEmail({ studentEmail, studentName }) {
  if (!studentEmail || !process.env.RESEND_API_KEY) return
  const firstName = escapeHtml(studentName?.split(' ')[0] ?? 'there')

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#211D17">
      <img src="${SITE_URL}/brainscribe-wordmark.png" alt="BrainScribe" width="124" height="40" style="display:block;width:124px;height:40px;border:0;margin-bottom:28px" />
      <h2 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#14385A">You're approved, ${firstName}! 🎉</h2>
      <p style="margin:0 0 16px;line-height:1.7;color:#4A4439">
        Great news — your parent approved your BrainScribe account. You can now sign
        in and start working on your assignments.
      </p>
      <a href="${SITE_URL}/login"
         style="display:inline-block;background:#F0811E;color:#fff;text-decoration:none;
                font-weight:700;padding:14px 28px;border-radius:12px;font-size:15px;margin-bottom:28px">
        Sign in to BrainScribe →
      </a>
      <p style="margin:0;font-size:13px;color:#6B6358;line-height:1.6">
        Your parent can see your session progress in their dashboard. Your words are
        always your own — BrainScribe just asks the questions.
      </p>
    </div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'BrainScribe <notifications@brainscribe.io>',
        to: studentEmail,
        subject: "You're approved! Sign in to BrainScribe",
        html,
      }),
    })
    if (!res.ok) console.error('[coppa/approval] Resend error:', await res.text())
  } catch (e) {
    console.error('[coppa/approval] Email send failed:', e)
  }
}
