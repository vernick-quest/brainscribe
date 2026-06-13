import { createClient } from '@/lib/supabase/server'

// GET — fetch current outline
export async function GET(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data } = await supabase.from('sessions').select('outline').eq('id', id).single()
  return Response.json(data?.outline ?? [])
}

// PATCH — save full outline (e.g. after paragraph approved)
export async function PATCH(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { outline } = await request.json()

  const { error } = await supabase
    .from('sessions')
    .update({ outline })
    .eq('id', id)
    .eq('student_id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
