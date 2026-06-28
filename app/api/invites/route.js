import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { MAX_CHILDREN_PER_PARENT, MAX_PARENTS_PER_CHILD } from '@/lib/relationships'
import { NextResponse } from 'next/server'

// POST /api/invites
// Generates a role-baked invite link. Who may send what:
//   - a student invites their parent or a teacher (teacher is per-assignment)
//   - a parent invites a child (student role) to link them (Entry Point B)
//   - a child's CONSENTING GUARDIAN invites a co-parent (a second parent) for
//     that under-13 child — view-only, never a consent grant (co-parent path)
// Body: { email, role: 'parent'|'teacher'|'student', assignmentId?, childId? }
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const { email, role, assignmentId, childId } = await request.json()

  if (!email?.trim()) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  if (!['parent', 'teacher', 'student'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }
  if (email.trim().toLowerCase() === (user.email ?? '').toLowerCase()) {
    return NextResponse.json({ error: "That's your own email — enter the other person's." }, { status: 400 })
  }

  // Authorize the sender against the invite role, and fail early if the sender's
  // own relationship cap is already full. (Only the sender's side can be checked
  // here under RLS — the recipient's cap is enforced authoritatively at claim
  // time in app/(auth)/invite.)
  if (role === 'student') {
    // Parent-initiated linking: only a parent may invite a child.
    if (profile?.role !== 'parent') {
      return NextResponse.json({ error: 'Only parents can invite a child.' }, { status: 403 })
    }
    const { count } = await supabase
      .from('relationships').select('id', { count: 'exact', head: true }).eq('watcher_id', user.id)
    if ((count ?? 0) >= MAX_CHILDREN_PER_PARENT) {
      return NextResponse.json({ error: `You're already linked to the maximum of ${MAX_CHILDREN_PER_PARENT} students.` }, { status: 400 })
    }
  } else if (role === 'parent' && childId) {
    // Co-parent: a child's CONSENTING GUARDIAN invites a second parent for that
    // child. Authorization is deliberately the strictest watcher relationship —
    // only the recorded consenting guardian of an *under-13* child (the same
    // identity the unlink guard protects), never just any linked parent. The
    // resulting link is read-only oversight; it does NOT make the recipient a
    // consenting guardian (claim never writes consent columns). The recipient
    // must still be 13+ — enforced at claim time in app/(auth)/invite.
    if (profile?.role !== 'parent') {
      return NextResponse.json({ error: 'Only a parent can invite a co-parent.' }, { status: 403 })
    }
    // Read the child's COPPA fields with the service client so the guardian check
    // is authoritative regardless of RLS column visibility.
    const svc = createServiceClient()
    const { data: child } = await svc
      .from('profiles').select('age_bracket, coppa_consent_parent_id').eq('id', childId).single()
    if (!child || child.age_bracket !== 'under13' || child.coppa_consent_parent_id !== user.id) {
      return NextResponse.json({ error: "Only this child's approving parent can invite a co-parent." }, { status: 403 })
    }
    const { count } = await svc
      .from('relationships').select('id', { count: 'exact', head: true }).eq('student_id', childId)
    if ((count ?? 0) >= MAX_PARENTS_PER_CHILD) {
      return NextResponse.json({ error: `This child already has the maximum of ${MAX_PARENTS_PER_CHILD} parents linked.` }, { status: 400 })
    }
  } else if (role === 'parent') {
    // Student inviting their parent.
    if (profile?.role !== 'student') {
      return NextResponse.json({ error: 'Only students can send these invites.' }, { status: 403 })
    }
    const { count } = await supabase
      .from('relationships').select('id', { count: 'exact', head: true }).eq('student_id', user.id)
    if ((count ?? 0) >= MAX_PARENTS_PER_CHILD) {
      return NextResponse.json({ error: `You already have the maximum of ${MAX_PARENTS_PER_CHILD} parents linked.` }, { status: 400 })
    }
  } else if (role === 'teacher') {
    // Teacher access is per-assignment and may be granted by the student who owns
    // the assignment OR a parent linked to that student.
    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID is required for teacher invites.' }, { status: 400 })
    }
    if (profile?.role === 'student') {
      const { data: session } = await supabase
        .from('sessions').select('id').eq('id', assignmentId).eq('student_id', user.id).single()
      if (!session) return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 })
    } else if (profile?.role === 'parent') {
      // The assignment must belong to one of this parent's linked children.
      const { data: session } = await supabase
        .from('sessions').select('student_id').eq('id', assignmentId).single()
      const { data: rel } = session?.student_id
        ? await supabase.from('relationships').select('watcher_id')
            .eq('watcher_id', user.id).eq('student_id', session.student_id).maybeSingle()
        : { data: null }
      if (!rel) return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 })
    } else {
      return NextResponse.json({ error: 'Only a student or their parent can invite a teacher.' }, { status: 403 })
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
      // Co-parent invite: bind to the target child so the claim links the new
      // parent to the CHILD (not to the inviting guardian). Requires the
      // invites.student_id column — migration 022 (pending). invited_by stays the
      // authorizing guardian for the audit trail.
      ...(role === 'parent' && childId ? { student_id: childId } : {}),
    })
    .select('token')
    .single()

  if (error) {
    console.error('[invites POST]', error)
    return NextResponse.json({ error: 'Failed to create invite.' }, { status: 500 })
  }

  return NextResponse.json({ token: invite.token })
}
