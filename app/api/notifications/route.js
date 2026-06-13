import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// PATCH /api/notifications
// Body: { ids?: string[] }  — if omitted, marks ALL unread as read.
export async function PATCH(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { ids } = body

  let query = supabase
    .from('teacher_notifications')
    .update({ read: true })
    .eq('teacher_id', user.id)
    .eq('read', false)

  if (ids?.length) {
    query = query.in('id', ids)
  }

  const { error } = await query

  if (error) {
    console.error('[notifications PATCH]', error)
    return NextResponse.json({ error: 'Failed to update.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
