import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { persistRequirementsActual } from '@/lib/requirements'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // A student writes at most a few paragraphs a minute — anything faster is a
  // script filling the DB. (Shared key with PATCH: it's one writing activity.)
  if (!await checkRateLimit(`paragraphs:${user.id}`, 30, 60)) return rateLimited()

  const { sessionId, scribedText, rawSpokenText, position, isThin } = await request.json()

  // Upsert, not insert: paragraphs(session_id, position) is unique (migration 027),
  // so re-saving a position replaces the row instead of erroring or duplicating.
  const { data, error } = await supabase
    .from('paragraphs')
    .upsert({ session_id: sessionId, scribed_text: scribedText, raw_spoken_text: rawSpokenText, position, is_thin: isThin ?? false },
      { onConflict: 'session_id,position' })
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

  if (!await checkRateLimit(`paragraphs:${user.id}`, 30, 60)) return rateLimited()

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
