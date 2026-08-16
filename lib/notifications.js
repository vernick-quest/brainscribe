import { createServiceClient } from '@/lib/supabase/service'

// ─────────────────────────────────────────────────────────────
// createNotification
// Called server-side whenever a teacher should be notified.
// type: 'assignment_shared' | 'assignment_complete'
// ─────────────────────────────────────────────────────────────
export async function createNotification({ teacherId, sessionId, type, message, teacherEmail }) {
  const service = createServiceClient()

  // 1. Insert DB record
  const { error } = await service.from('teacher_notifications').insert({
    teacher_id: teacherId,
    session_id: sessionId ?? null,
    type,
    message,
  })

  if (error) {
    console.error('[notifications] DB insert error:', error)
  }

  // 2. Send email (requires RESEND_API_KEY in .env.local)
  if (teacherEmail && process.env.RESEND_API_KEY) {
    await sendEmail({ to: teacherEmail, type, message, sessionId })
  }
}

// ─────────────────────────────────────────────────────────────
// createNotificationsForSession
// Notify all teachers linked to a session (used on completion).
// ─────────────────────────────────────────────────────────────
export async function createNotificationsForSession({ sessionId, type, message }) {
  const service = createServiceClient()

  // Get all teachers + their emails for this session
  const { data: links } = await service
    .from('assignment_teachers')
    .select('teacher_id, profiles!assignment_teachers_teacher_id_fkey(email)')
    .eq('session_id', sessionId)

  if (!links?.length) return

  await Promise.all(
    links.map(link =>
      createNotification({
        teacherId: link.teacher_id,
        teacherEmail: link.profiles?.email,
        sessionId,
        type,
        message,
      })
    )
  )
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

// ─────────────────────────────────────────────────────────────
// sendInviteEmail  (Resend)
// Emails an invite link to the invited address so an invite isn't only a link the
// sender has to copy + paste elsewhere. Best-effort: returns false (never throws)
// if RESEND_API_KEY is unset or the send fails — the caller still returns the link
// for manual sharing. `role` is the invitee's role (who is being invited).
// ─────────────────────────────────────────────────────────────
/**
 * Ops alert: an access code just crossed a redemption threshold.
 *
 * Reaching the ceiling already stops a code dead (claim_access_code won't match it),
 * but silently — this is the part that tells you. `level` is 'cap' or 'warning' from
 * accessCodeAlertLevel(). Best-effort: returns false rather than throwing, and the
 * caller must never let it affect the student's redemption.
 *
 * Deliberately plain text — this is an ops email to the operator, not a branded one
 * to a family, and it should read the same in any client.
 */
export async function sendAccessCodeAlert({ to, code, uses, maxUses, level }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!recipients.length || !code || !process.env.RESEND_API_KEY) return false

  const atCap = level === 'cap'
  const subject = atCap
    ? `BrainScribe: access code "${code}" is fully claimed (${uses}/${maxUses})`
    : `BrainScribe: access code "${code}" is at ${uses}/${maxUses}`

  const body = atCap
    ? `The code "${code}" has reached its limit of ${maxUses} redemptions and will no longer let anyone in — every further attempt now gets "That code has been fully claimed."\n\nNothing is broken; this is the cap doing its job. If you want to keep letting people in, either raise the limit or create a new code in /admin → Tools → Beta Circle.\n\nIf you did NOT expect to hit this, the code may have been shared more widely than intended. Note that already-granted access is not revoked by capping or deactivating a code.`
    : `The code "${code}" has been redeemed ${uses} times out of a limit of ${maxUses}.\n\nNo action needed yet — this is the heads-up so the ceiling doesn't arrive as a surprise. Raise the limit or mint a new code in /admin → Tools → Beta Circle.\n\nIf that's faster than you expected, it's worth checking whether the code has spread beyond the people you gave it to.`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'BrainScribe <notifications@brainscribe.io>',
        to: recipients,
        subject,
        text: body,
      }),
    })
    if (!res.ok) {
      console.error('[access code alert] Resend error:', await res.text())
      return false
    }
    return true
  } catch (e) {
    console.error('[access code alert] send failed:', e)
    return false
  }
}

export async function sendInviteEmail({ to, role, inviteLink, inviterName, coparent = false }) {
  if (!to || !inviteLink || !process.env.RESEND_API_KEY) return false

  const who = escapeHtml(inviterName?.trim() || 'Someone')
  const COPY = {
    student: {
      subject: `${inviterName?.trim() || 'A parent'} invited you to BrainScribe`,
      heading: "You're invited to BrainScribe",
      body: `${who} invited you to connect your writing to their account. Sign in with <strong>this email address</strong> to get started — your words always stay your own; the coach just asks the questions.`,
      cta: 'Accept invite →',
    },
    parent: {
      subject: "You've been invited to BrainScribe",
      heading: "You're invited to BrainScribe",
      body: `${who} invited you to connect on BrainScribe as a parent or guardian. You'll be able to follow their writing sessions — read-only.`,
      cta: 'Accept invite →',
    },
    teacher: {
      subject: "You've been added to a BrainScribe assignment",
      heading: "You're invited to BrainScribe",
      body: `${who} invited you to view a student's assignment on BrainScribe as a teacher — read-only.`,
      cta: 'View invite →',
    },
  }
  // A `parent`-role invite with coparent:true is an account-level CO-parent invite
  // (a primary parent adding a second parent) — different framing from a student
  // inviting their own parent: the co-parent shares the primary's children.
  const coParentCopy = {
    subject: `${inviterName?.trim() || 'A parent'} invited you to co-parent on BrainScribe`,
    heading: "You're invited to BrainScribe",
    body: `${who} invited you to join their BrainScribe account as a co-parent. You'll share all of their children — current and future — and can follow every writing session, read-only. Sign in with <strong>this email address</strong> to accept.`,
    cta: 'Accept invite →',
  }
  const c = (role === 'parent' && coparent) ? coParentCopy : (COPY[role] ?? COPY.parent)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brainscribe.io'

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#211D17">
      <img src="${siteUrl}/brainscribe-wordmark.png" alt="BrainScribe" width="124" height="40" style="display:block;width:124px;height:40px;border:0;margin-bottom:24px" />
      <h2 style="font-size:18px;font-weight:700;margin:0 0 12px;color:#14385A">${c.heading}</h2>
      <p style="margin:0 0 20px;line-height:1.6;color:#4A4439">${c.body}</p>
      <a href="${inviteLink}"
        style="display:inline-block;background:#F0811E;color:#fff;text-decoration:none;
               font-weight:700;padding:12px 24px;border-radius:12px;font-size:14px">
        ${c.cta}
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#8C8474;line-height:1.6">
        If you weren't expecting this, you can safely ignore this email — nothing happens until you sign in.
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'BrainScribe <notifications@brainscribe.io>', to, subject: c.subject, html }),
    })
    if (!res.ok) {
      console.error('[invite email] Resend error:', await res.text())
      return false
    }
    return true
  } catch (e) {
    console.error('[invite email] send failed:', e)
    return false
  }
}

// ─────────────────────────────────────────────────────────────
// Waitlist — acknowledgment and approval
//
// Someone requested access on 2026-07-29 and was still sitting in silence on 08-16,
// because /api/subscribe wrote a row and told nobody. These are the two ends of that:
// an immediate "we got it" so nobody waits in the dark, and the code itself once an
// admin approves. Both follow sendInviteEmail's shape (brand header, one CTA, plain
// escape hatch) and both fail soft — a send that doesn't happen must never turn into
// an error the requester sees.
// ─────────────────────────────────────────────────────────────

function waitlistShell(heading, bodyHtml, ctaHref, ctaLabel) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brainscribe.io'
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#211D17">
      <img src="${siteUrl}/brainscribe-wordmark.png" alt="BrainScribe" width="124" height="40" style="display:block;width:124px;height:40px;border:0;margin-bottom:24px" />
      <h2 style="font-size:18px;font-weight:700;margin:0 0 12px;color:#14385A">${heading}</h2>
      ${bodyHtml}
      ${ctaHref ? `<a href="${ctaHref}"
        style="display:inline-block;background:#F0811E;color:#fff;text-decoration:none;
               font-weight:700;padding:12px 24px;border-radius:12px;font-size:14px">${ctaLabel}</a>` : ''}
      <p style="margin:24px 0 0;font-size:12px;color:#8C8474;line-height:1.6">
        You're getting this because you asked for access to BrainScribe. If that wasn't you, ignore this email — nothing happens until you sign in.
      </p>
    </div>
  `
}

async function sendViaResend({ to, subject, html, tag }) {
  if (!to || !process.env.RESEND_API_KEY) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'BrainScribe <notifications@brainscribe.io>', to, subject, html }),
    })
    if (!res.ok) {
      console.error(`[${tag}] Resend error:`, await res.text())
      return false
    }
    return true
  } catch (e) {
    console.error(`[${tag}] send failed:`, e)
    return false
  }
}

// Fires automatically the moment someone asks. Deliberately promises NOTHING about
// timing — an acknowledgment that invents a date becomes a second broken promise.
export async function sendWaitlistAck({ to }) {
  return sendViaResend({
    to,
    tag: 'waitlist ack',
    subject: 'We got your BrainScribe request',
    html: waitlistShell(
      'Thanks — you’re on the list',
      `<p style="margin:0 0 20px;line-height:1.6;color:#4A4439">
         BrainScribe is invite-only while we’re in early access, so we’re letting people in a
         few at a time. We’ll email you a code as soon as there’s room.
       </p>
       <p style="margin:0 0 20px;line-height:1.6;color:#4A4439">
         Nothing to do for now — this note is just so you know a person will see your request.
       </p>`,
      null, null,
    ),
  })
}

// Sent when an admin approves someone. Names the code in the body as well as the link,
// because people forward these and paste the code by hand.
export async function sendWaitlistCode({ to, code }) {
  if (!to || !code) return false
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brainscribe.io'
  return sendViaResend({
    to,
    tag: 'waitlist code',
    subject: 'Your BrainScribe access code',
    html: waitlistShell(
      'You’re in',
      `<p style="margin:0 0 20px;line-height:1.6;color:#4A4439">
         Here’s your access code for BrainScribe:
       </p>
       <p style="margin:0 0 20px;font-size:22px;font-weight:700;letter-spacing:1px;color:#14385A">
         ${escapeHtml(code)}
       </p>
       <p style="margin:0 0 20px;line-height:1.6;color:#4A4439">
         Sign in with Google, and you’ll be asked for the code on the way in. Your words stay
         your own — the coach only ever asks the questions.
       </p>`,
      `${siteUrl}/login`,
      'Sign in and enter your code →',
    ),
  })
}

// ─────────────────────────────────────────────────────────────
// Blog post mailing
//
// The blog form has promised "we'll send new posts as they go up" since it shipped, and
// nothing ever sent one. This is that sender.
//
// 🔴 THE HEADERS ARE THE POINT, not the body. Gmail and Yahoo bulk-sender rules expect
// List-Unsubscribe plus List-Unsubscribe-Post one-click, and an opt-out is the one thing
// that cannot be retrofitted onto people you have already emailed. If you are tempted to
// ship a "quick version" without them, ship nothing instead.
// ─────────────────────────────────────────────────────────────

export async function sendBlogPost({ to, post, unsubscribeUrl }) {
  if (!to || !post?.slug || !process.env.RESEND_API_KEY) return false
  if (!unsubscribeUrl) {
    // Refuse rather than send an un-unsubscribable email. Recoverable here; not
    // recoverable once it has landed in someone's inbox.
    console.error('[blog mail] refusing to send without an unsubscribe URL:', to)
    return false
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.brainscribe.io'
  const postUrl = `${siteUrl}/blog/${post.slug}`
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#211D17">
      <img src="${siteUrl}/brainscribe-wordmark.png" alt="BrainScribe" width="124" height="40" style="display:block;width:124px;height:40px;border:0;margin-bottom:24px" />
      <h2 style="font-size:18px;font-weight:700;margin:0 0 12px;color:#14385A">${escapeHtml(post.title ?? 'A new post')}</h2>
      ${post.excerpt ? `<p style="margin:0 0 20px;line-height:1.6;color:#4A4439">${escapeHtml(post.excerpt)}</p>` : ''}
      <a href="${postUrl}"
        style="display:inline-block;background:#F0811E;color:#fff;text-decoration:none;
               font-weight:700;padding:12px 24px;border-radius:12px;font-size:14px">Read it →</a>
      <p style="margin:28px 0 0;font-size:12px;color:#8C8474;line-height:1.6">
        You're getting this because you asked for new BrainScribe posts.
        <a href="${unsubscribeUrl}" style="color:#8C8474">Unsubscribe</a> — one click, no questions.
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'BrainScribe <notifications@brainscribe.io>',
        to,
        subject: post.title ?? 'A new post from BrainScribe',
        html,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          // RFC 8058. Without this, Gmail shows no one-click control and the mail is
          // scored as bulk without an opt-out.
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    })
    if (!res.ok) {
      console.error('[blog mail] Resend error:', await res.text())
      return false
    }
    return true
  } catch (e) {
    console.error('[blog mail] send failed:', e)
    return false
  }
}

// ─────────────────────────────────────────────────────────────
// sendEmail  (Resend)
// Silently skips if RESEND_API_KEY is not set.
// ─────────────────────────────────────────────────────────────
async function sendEmail({ to, type, message, sessionId }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brainscribe.io'
  const assignmentUrl = sessionId ? `${siteUrl}/assignment/${sessionId}` : siteUrl

  const subject = type === 'assignment_complete'
    ? '✓ A student finished their assignment — BrainScribe'
    : "📋 You've been added to a student assignment — BrainScribe"

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#211D17">
      <img src="${siteUrl}/brainscribe-wordmark.png" alt="BrainScribe" width="124" height="40" style="display:block;width:124px;height:40px;border:0;margin-bottom:24px" />
      <h2 style="font-size:18px;font-weight:700;margin:0 0 12px;color:#14385A">${subject}</h2>
      <p style="margin:0 0 20px;line-height:1.6;color:#4A4439">${message}</p>
      <a href="${assignmentUrl}"
        style="display:inline-block;background:#F0811E;color:#fff;text-decoration:none;
               font-weight:700;padding:12px 24px;border-radius:12px;font-size:14px">
        View assignment →
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#8C8474">
        You're receiving this because you're a teacher on BrainScribe.
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
        to,
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('[notifications] Resend error:', err)
    }
  } catch (e) {
    console.error('[notifications] Email send failed:', e)
  }
}
