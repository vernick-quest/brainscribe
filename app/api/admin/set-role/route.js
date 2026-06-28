import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

const VALID_ROLES = ['student', 'parent', 'teacher', 'admin']

// PATCH /api/admin/set-role — change a user's role
export async function PATCH(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, role } = await request.json()
  if (!userId || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid fields' }, { status: 400 })
  }

  // Guard against self-lockout: the actor is always an admin, so refusing to let
  // them drop their own admin role is enough to guarantee at least one admin
  // always remains (no need to count). Use impersonation to view other roles.
  if (userId === user.id && role !== 'admin') {
    return NextResponse.json({ error: "You can't remove your own admin role." }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({ role })
    .eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
