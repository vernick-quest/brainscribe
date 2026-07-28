import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/draft-feedback — the student answers "does this match what you wrote?"
//
// Owner-only, and deliberately so: a watcher can read the answer but only the student can
// give it. RLS (migration 052) enforces both; the checks here are the near-the-data layer.

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const { sessionId, matches, note, finalWords, source = 'transcript' } = body
  if (!sessionId || typeof matches !== 'boolean') {
    return NextResponse.json({ error: 'sessionId and matches are required' }, { status: 400 })
  }
  // 'in_session' = flagged while still writing (Elio said "the body is not showing where
  // all my writing is" mid-session and there was nowhere for it to land). 'transcript' =
  // answered at the end. One standing report per source, so repeat taps update rather
  // than pile up — spam control lives in the unique index, not in a rate limiter.
  if (source !== 'transcript' && source !== 'in_session') {
    return NextResponse.json({ error: 'Unknown source' }, { status: 400 })
  }

  // Confirm the caller owns this session before writing anything against it.
  const { data: session } = await supabase
    .from('sessions').select('id, student_id').eq('id', sessionId).single()
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.student_id !== user.id) {
    return NextResponse.json({ error: 'Only the student can answer this' }, { status: 403 })
  }

  const { error } = await supabase
    .from('draft_feedback')
    .upsert({
      session_id: sessionId,
      student_id: user.id,
      matches,
      source,
      note: typeof note === 'string' ? note.slice(0, 1000) : null,
      final_words: Number.isFinite(finalWords) ? finalWords : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id,source' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
