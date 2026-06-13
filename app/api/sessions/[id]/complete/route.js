import { createClient } from '@/lib/supabase/server'
import { createNotificationsForSession } from '@/lib/notifications'
import { analyzeWriting } from '@/lib/analyzeWriting'
import { NextResponse } from 'next/server'

// PATCH /api/sessions/[id]/complete
// Marks the session complete and notifies any linked teachers.
export async function PATCH(request, { params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: session } = await supabase
    .from('sessions')
    .select('id, student_id, title, assignment_text, status')
    .eq('id', id)
    .single()

  if (!session || session.student_id !== user.id) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  // Already complete — idempotent, just return ok
  if (session.status === 'complete') {
    return NextResponse.json({ ok: true })
  }

  // Mark complete
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'complete' })
    .eq('id', id)

  if (error) {
    console.error('[sessions complete]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch student name for notification message
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const studentName = studentProfile?.full_name ?? 'Your student'
  const assignmentLabel = session.title
    || session.assignment_text?.slice(0, 60) + (session.assignment_text?.length > 60 ? '…' : '')
    || 'an assignment'

  // Notify all teachers on this session (fire-and-forget)
  createNotificationsForSession({
    sessionId: id,
    type: 'assignment_complete',
    message: `${studentName} finished their assignment: "${assignmentLabel}"`,
  }).catch(e => console.error('[notifications complete]', e))

  // Analyze writing profile (fire-and-forget — takes a few seconds)
  const { data: paragraphs } = await supabase
    .from('paragraphs')
    .select('scribed_text')
    .eq('session_id', id)
    .order('position')

  const essay = paragraphs?.map(p => p.scribed_text).join('\n\n') ?? ''

  analyzeWriting({ sessionId: id, essay, assignmentText: session.assignment_text })
    .catch(e => console.error('[analyzeWriting complete]', e))

  return NextResponse.json({ ok: true })
}
