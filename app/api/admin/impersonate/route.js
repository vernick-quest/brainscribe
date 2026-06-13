import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/admin/impersonate — start impersonating a user
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, role, name } = await request.json()
  if (!userId || !role) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const dest = role === 'parent' ? '/parent' : role === 'teacher' ? '/teacher' : '/dashboard'
  const response = NextResponse.json({ dest })

  response.cookies.set('bs_impersonate', JSON.stringify({ userId, role, name }), {
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
