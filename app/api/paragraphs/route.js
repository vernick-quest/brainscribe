import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { persistRequirementsActual } from '@/lib/requirements'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, scribedText, rawSpokenText, position, isThin } = await request.json()

  const { data, error } = await supabase
    .from('paragraphs')
    .insert({ session_id: sessionId, scribed_text: scribedText, raw_spoken_text: rawSpokenText, position, is_thin: isThin ?? false })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Keep sessions.requirements.actual fresh after each paragraph save — deferred
  // so it never adds latency to the student's save (no-op if no requirements set).
  after(() => persistRequirementsActual(supabase, sessionId))

  return Response.json(data)
}

export async function PATCH(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, position, scribedText } = await request.json()

  const { data, error } = await supabase
    .from('paragraphs')
    .update({ scribed_text: scribedText })
    .eq('session_id', sessionId)
    .eq('position', position)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  after(() => persistRequirementsActual(supabase, sessionId))

  return Response.json(data)
}
