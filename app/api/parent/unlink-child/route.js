import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

// POST /api/parent/unlink-child — remove the watcher→student relationship so a
// parent stops following a child. Body: { studentId, watcherId }.
//
// `relationships` has no client DELETE policy, so this runs service-role after
// verifying the caller owns the link (watcherId === caller) or is an admin acting
// on behalf of that watcher.
//
// COPPA guard: refuse to unlink an under-13 child for whom the watcher being
// removed is the recorded consenting parent — that would strip the only verified
// guardian off a protected account. (Auth & COPPA owns the gate; revisit if a
// consent-transfer path is preferred over a hard block.) Unlinking does NOT touch
// consent columns — it only removes ongoing visibility.
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { studentId, watcherId } = await request.json()
  if (!studentId || !watcherId) {
    return NextResponse.json({ error: 'studentId and watcherId are required.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: actor } = await service.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = actor?.role === 'admin'

  // A non-admin may only remove their own link.
  if (!isAdmin && watcherId !== user.id) {
    return NextResponse.json({ error: 'You can only unlink your own account.' }, { status: 403 })
  }

  const { data: rel } = await service
    .from('relationships').select('id')
    .eq('watcher_id', watcherId).eq('student_id', studentId).maybeSingle()
  if (!rel) return NextResponse.json({ error: 'No link found for this student.' }, { status: 404 })

  // COPPA: don't orphan a protected child from their consenting guardian.
  const { data: child } = await service
    .from('profiles').select('age_bracket, coppa_consent_parent_id').eq('id', studentId).single()
  if (child?.age_bracket === 'under13' && child?.coppa_consent_parent_id === watcherId) {
    return NextResponse.json(
      {
        error: "This child's account depends on your approval, so it can't be unlinked here. Contact support to transfer guardianship.",
        code: 'coppa_guardian',
      },
      { status: 403 }
    )
  }

  const { error } = await service
    .from('relationships').delete()
    .eq('watcher_id', watcherId).eq('student_id', studentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
