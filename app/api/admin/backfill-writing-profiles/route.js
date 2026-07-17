import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { analyzeWriting } from '@/lib/analyzeWriting'
import { NextResponse } from 'next/server'

export const maxDuration = 300 // several Haiku calls may run in one sweep

// POST /api/admin/backfill-writing-profiles
//
// Maintenance sweep: re-run writing analysis on completed, non-onboarding sessions
// that have real content but NO per-session writing_profile — i.e. the completions
// the old fire-and-forget after() missed, which left the student's cross-assignment
// aggregate (based_on_count) behind the real essay count. (Completion now AWAITS
// analyzeWriting, so new misses shouldn't occur — this cleans up the historical
// gap and is a safety net.)
//
// Idempotent: only touches sessions where writing_profile IS NULL, and
// analyzeWriting accumulates onto the CURRENT aggregate, so re-running is safe and
// won't double-count already-analyzed essays. Processed oldest-first so the
// aggregate rebuilds in chronological order.
//
// Auth: an admin session OR the CRON_SECRET bearer (so it can be run as a job).
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
  const { data: sessions } = await svc
    .from('sessions')
    .select('id, student_id, assignment_text')
    .eq('status', 'complete')
    .eq('is_onboarding', false)
    .is('writing_profile', null)
    .order('created_at', { ascending: true })

  const results = []
  for (const s of sessions ?? []) {
    const { data: paras } = await svc
      .from('paragraphs').select('scribed_text').eq('session_id', s.id).order('position')
    const essay = (paras ?? []).map(p => p.scribed_text).join('\n\n')
    if (essay.trim().length < 30) { results.push({ id: s.id, skipped: 'no-content' }); continue }
    try {
      await analyzeWriting({ sessionId: s.id, essay, assignmentText: s.assignment_text, userId: s.student_id })
      results.push({ id: s.id, student_id: s.student_id, ok: true })
    } catch (e) {
      results.push({ id: s.id, error: String(e?.message || e) })
    }
  }

  return NextResponse.json({
    scanned: sessions?.length ?? 0,
    backfilled: results.filter(r => r.ok).length,
    results,
  })
}
