import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

// POST /api/invites
// Generates a role-baked invite link. Who may send what:
//   - a student invites their parent or a teacher (teacher is per-assignment)
//   - a parent invites a child (student role) to link them (Entry Point B)
// Body: { email, role: 'parent'|'teacher'|'student', assignmentId? }
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const { email, role, assignmentId } = await request.json()

  if (!email?.trim()) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  if (!['parent', 'teacher', 'student'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }
  if (email.trim().toLowerCase() === (user.email ?? '').toLowerCase()) {
    return NextResponse.json({ error: "That's your own email — enter the other person's." }, { status: 400 })
  }

  // Authorize the sender against the invite role.
  if (role === 'student') {
    // Parent-initiated linking: only a parent may invite a child.
    if (profile?.role !== 'parent') {
      return NextResponse.json({ error: 'Only parents can invite a child.' }, { status: 403 })
    }
  } else if (profile?.role !== 'student') {
    return NextResponse.json({ error: 'Only students can send these invites.' }, { status: 403 })
  }

  if (role === 'teacher' && !assignmentId) {
    return NextResponse.json({ error: 'Assignment ID is required for teacher invites.' }, { status: 400 })
  }

  // For teacher invites, verify the assignment belongs to this student
  if (role === 'teacher') {
    const { data: session } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', assignmentId)
      .eq('student_id', user.id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 })
    }
  }

  // Use service role to bypass RLS insert restriction on invites
  const service = createServiceClient()
  const { data: invite, error } = await service
    .from('invites')
    .insert({
      email: email.trim().toLowerCase(),
      role,
      invited_by: user.id,
      ...(role === 'teacher' && assignmentId ? { assignment_id: assignmentId } : {}),
    })
    .select('token')
    .single()

  if (error) {
    console.error('[invites POST]', error)
    return NextResponse.json({ error: 'Failed to create invite.' }, { status: 500 })
  }

  return NextResponse.json({ token: invite.token })
}
