import { createClient } from '@/lib/supabase/server'

export async function PATCH(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { full_name, phone } = await request.json()
  if (!full_name?.trim()) return Response.json({ error: 'Name is required' }, { status: 400 })

  const update = { full_name: full_name.trim() }

  // Contact phone is ADULT-only — never store a minor's phone (COPPA). Gate the
  // write on the caller's role; students silently don't get a phone field in the
  // UI, and this is the server-side backstop. `phone` is optional; '' clears it.
  if (phone !== undefined) {
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'student') {
      const trimmed = String(phone).trim()
      if (trimmed && !/^[0-9+()\-.\s]{7,20}$/.test(trimmed)) {
        return Response.json({ error: 'That phone number doesn’t look right.' }, { status: 400 })
      }
      update.phone = trimmed || null
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
