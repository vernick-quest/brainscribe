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

// ─────────────────────────────────────────────────────────────
// sendEmail  (Resend)
// Silently skips if RESEND_API_KEY is not set.
// ─────────────────────────────────────────────────────────────
async function sendEmail({ to, type, message, sessionId }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brainscribe.ai'
  const assignmentUrl = sessionId ? `${siteUrl}/assignment/${sessionId}` : siteUrl

  const subject = type === 'assignment_complete'
    ? '✓ A student finished their assignment — BrainScribe'
    : "📋 You've been added to a student assignment — BrainScribe"

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#211D17">
      <img src="${siteUrl}/brainscribe-wordmark.png" alt="BrainScribe" style="height:32px;margin-bottom:24px" />
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
