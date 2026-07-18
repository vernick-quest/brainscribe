import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { newSessionGreeting } from '@/lib/greeting'
import { NextResponse } from 'next/server'

export const maxDuration = 300 // may sweep many historical sessions

// POST /api/admin/backfill-greetings
//
// One-time maintenance sweep: reconstruct the coach's OPENING greeting for
// historical non-onboarding assignment sessions that predate greeting persistence
// (the opener used to be delivered client-side and never saved, so it's absent from
// DB-backed transcripts). The opener is deterministic — newSessionGreeting(persona,
// firstName) reproduces exactly the line the session showed — so this reconstructs,
// it doesn't fabricate.
//
// Scope: non-onboarding, non-gym sessions whose FIRST message (by created_at) is a
// student ('user') turn — i.e. no leading assistant greeting. Onboarding + new
// sessions already persist their greeting; gym sessions have their own opener.
//
// Idempotent: a session whose first message is already an assistant greeting is
// skipped, so re-running is safe. The inserted greeting gets created_at = 1s before
// the first message so it sorts to the top (all readers order messages by created_at).
//
// CAVEAT (documented): persona is read from sessions.persona (the CURRENT persona).
// A session that switched coaches mid-way gets an opener naming the current coach,
// not the original — a rare cosmetic imperfection, accepted for complete transcripts.
//
// Auth: an admin session OR the CRON_SECRET bearer.
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: prof } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).single()
    : { data: null }
  const isAdmin = prof?.role === 'admin'
  const bearerOk = !!process.env.CRON_SECRET &&
    request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!isAdmin && !bearerOk) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = createServiceClient()
  // Non-onboarding, non-gym sessions. Resilient to a pre-025 DB with no
  // gym_session_id column (fall back to the unfiltered query — no gym rows exist then).
  let sessionsRes = await svc
    .from('sessions')
    .select('id, student_id, persona, created_at')
    .eq('is_onboarding', false)
    .is('gym_session_id', null)
  if (sessionsRes.error) {
    sessionsRes = await svc
      .from('sessions').select('id, student_id, persona, created_at').eq('is_onboarding', false)
  }
  const sessions = sessionsRes.data ?? []

  // Batch the student first names in one query.
  const studentIds = [...new Set(sessions.map(s => s.student_id).filter(Boolean))]
  const names = {}
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data: profs } = await svc
      .from('profiles').select('id, full_name').in('id', studentIds.slice(i, i + 200))
    for (const p of profs ?? []) names[p.id] = p.full_name?.split(' ')[0] ?? 'there'
  }

  const results = []
  for (const s of sessions) {
    // First message by created_at — the cheap signal for "already has a greeting".
    const { data: first } = await svc
      .from('messages').select('role, created_at')
      .eq('session_id', s.id).order('created_at', { ascending: true }).limit(1)
    const firstMsg = first?.[0]
    if (!firstMsg) { results.push({ id: s.id, skipped: 'no-messages' }); continue }
    if (firstMsg.role === 'assistant') { results.push({ id: s.id, skipped: 'has-greeting' }); continue }

    // Place the greeting 1s before the first (student) message so it sorts first.
    const beforeMs = Date.parse(firstMsg.created_at) - 1000
    const createdAt = Number.isNaN(beforeMs) ? s.created_at : new Date(beforeMs).toISOString()
    const { error } = await svc.from('messages').insert({
      session_id: s.id,
      role: 'assistant',
      content: newSessionGreeting(s.persona, names[s.student_id] ?? 'there'),
      created_at: createdAt,
    })
    if (error) results.push({ id: s.id, error: error.message })
    else results.push({ id: s.id, ok: true })
  }

  return NextResponse.json({
    scanned: sessions.length,
    backfilled: results.filter(r => r.ok).length,
    skipped: results.filter(r => r.skipped).length,
    results,
  })
}
