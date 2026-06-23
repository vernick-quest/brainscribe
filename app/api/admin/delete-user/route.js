import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

// POST /api/admin/delete-user — permanently delete a user (admin only).
// Deleting the auth.users row cascades to profiles → sessions → messages /
// paragraphs / scaffolds / relationships / assignment_teachers (all ON DELETE
// CASCADE in the schema), so this removes the account and all its data.
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  if (userId === user.id) return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service.auth.admin.deleteUser(userId)
  if (error) {
    console.error('[admin delete-user]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
