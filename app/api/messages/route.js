import { createClient } from '@/lib/supabase/server'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, content } = await request.json()

  // Never trust a client-supplied role — force 'user' (CLAUDE.md invariant).
  const { data, error } = await supabase
    .from('messages')
    .insert({ session_id: sessionId, role: 'user', content })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
