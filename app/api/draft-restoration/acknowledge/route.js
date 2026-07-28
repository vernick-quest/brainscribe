import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/draft-restoration/acknowledge — the student dismisses the "we put your
// writing back" notice. Once acknowledged the banner never returns.
//
// Only the student may dismiss it. A parent clearing the notice would mean the child
// never learns their essay was repaired, which is the thing the notice exists to prevent.
// RLS (migration 053) grants UPDATE to the owner only; this is the near-the-data check.

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const { sessionId } = body
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

  // Scoped by student_id as well as session_id so the write can't be aimed elsewhere even
  // if RLS were ever relaxed.
  const { error } = await supabase
    .from('draft_restorations')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('student_id', user.id)
    .is('acknowledged_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
