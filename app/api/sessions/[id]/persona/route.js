import { createClient } from '@/lib/supabase/server'

export async function PATCH(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { persona } = await request.json()

  if (!['marcus', 'zoe', 'oliver', 'isla', 'sam', 'jordan'].includes(persona)) {
    return Response.json({ error: 'Invalid persona' }, { status: 400 })
  }

  const { error } = await supabase
    .from('sessions')
    .update({ persona })
    .eq('id', id)
    .eq('student_id', user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Log the switch as a system message in the transcript
  await supabase.from('messages').insert({
    session_id: id,
    role: 'system',
    content: `[Student switched to ${persona}]`,
  })

  return Response.json({ ok: true })
}
