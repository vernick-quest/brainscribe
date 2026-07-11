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

  // Touch last-activity so the multi-session resume time-gate can distinguish a real
  // return (welcome-back greeting) from a same-sitting refresh. Owner-scoped via RLS
  // ("sessions: student owns"); non-fatal — a failed touch just falls back to the
  // newest-message timestamp gate.
  const { error: touchErr } = await supabase
    .from('sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (touchErr) console.error('[messages] last_active_at touch failed:', touchErr.message)

  return Response.json(data)
}
