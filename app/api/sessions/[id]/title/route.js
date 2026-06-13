import { createClient } from '@/lib/supabase/server'

export async function PATCH(request, { params }) {
  const { id } = await params
  const { title } = await request.json()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('sessions')
    .update({ title })
    .eq('id', id)
    .eq('student_id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
