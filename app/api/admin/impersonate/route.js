import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

// POST /api/admin/impersonate — start impersonating a user.
// Takes only { userId }; role + name are resolved server-side from the DB so a
// stale/mismatched client payload can never set the wrong identity.
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  // Authoritative role/name from the DB (service client — admin already verified).
  const service = createServiceClient()
  const { data: target } = await service
    .from('profiles').select('role, full_name').eq('id', userId).single()
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const role = target.role
  const dest = role === 'parent' ? '/parent' : role === 'teacher' ? '/teacher' : '/dashboard'
  const response = NextResponse.json({ dest, role, name: target.full_name })

  response.cookies.set('bs_impersonate', JSON.stringify({ userId, role, name: target.full_name }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })

  return response
}

// DELETE /api/admin/impersonate — stop impersonating, return to admin
export async function DELETE() {
  const response = NextResponse.json({ dest: '/admin' })
  response.cookies.set('bs_impersonate', '', { path: '/', maxAge: 0 })
  return response
}
