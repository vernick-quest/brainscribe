import { createClient } from '@/lib/supabase/server'

export async function PATCH(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { full_name } = await request.json()
  if (!full_name?.trim()) return Response.json({ error: 'Name is required' }, { status: 400 })

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: full_name.trim() })
    .eq('id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
