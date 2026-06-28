import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

// DELETE /api/assignment-teachers — remove a teacher's access to one assignment.
// Body: { sessionId, teacherId }. Allowed for an admin, the student who owns the
// session, or a parent linked to that student. assignment_teachers RLS already
// permits the student/parent delete, but this endpoint also covers the admin
// (remote-in) case and keeps the authorization explicit.
export async function DELETE(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, teacherId } = await request.json()
  if (!sessionId || !teacherId) {
    return NextResponse.json({ error: 'sessionId and teacherId are required.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: actor } = await service.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = actor?.role === 'admin'

  if (!isAdmin) {
    const { data: session } = await service
      .from('sessions').select('student_id').eq('id', sessionId).single()
    if (!session) return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 })

    let allowed = session.student_id === user.id
    if (!allowed) {
      const { data: rel } = await service
        .from('relationships').select('watcher_id')
        .eq('watcher_id', user.id).eq('student_id', session.student_id).maybeSingle()
      allowed = !!rel
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Not authorized to manage this assignment.' }, { status: 403 })
    }
  }

  const { error } = await service
    .from('assignment_teachers').delete()
    .eq('session_id', sessionId).eq('teacher_id', teacherId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
