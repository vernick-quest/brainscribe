import { createClient } from '@/lib/supabase/server'
import { assembleParagraphText } from '@/lib/assembleParagraph'
import { COACH_GATE_COLUMNS, coachGateFailure } from '@/lib/access'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Coach reachability gate (lib/access.js) — this runs a Haiku assembly call, so an
  // unconsented under-13 OR an authed user with no Beta access must not reach it.
  // Checked BEFORE the model runs. Fails CLOSED on a missing/odd access_granted.
  const { data: gate } = await supabase
    .from('profiles').select(COACH_GATE_COLUMNS).eq('id', user.id).single()
  const gateFail = coachGateFailure(gate)
  if (gateFail) return gateFail

  const { sessionId, paragraphIndex, paragraphType, components } = await request.json()
  // components: [{ id, label, text }, ...]
  if (!sessionId) return Response.json({ error: 'Missing sessionId' }, { status: 400 })

  // Ownership — the model must never run on arbitrary body `components` for a session
  // the caller doesn't own (previously the ONLY check was `if (!user)`). RLS returns
  // the row only to a permitted reader; a non-owner with no owned row is rejected
  // BEFORE assembly. A real admin (impersonation path) is allowed through — mirrors
  // /api/tutor. This closes the ghostwriting-on-arbitrary-text side door.
  const { data: sessionRow } = await supabase
    .from('sessions').select('student_id').eq('id', sessionId).single()
  const isOwner = sessionRow?.student_id === user.id
  if (!isOwner && gate?.role !== 'admin') {
    return Response.json({ error: 'Not found.' }, { status: 404 })
  }

  const { assembled, componentText } = await assembleParagraphText({
    components, paragraphType, sessionId, userId: user.id,
  })

  // Save the assembled paragraph to the paragraphs table
  const { data: para, error } = await supabase
    .from('paragraphs')
    .upsert({
      session_id: sessionId,
      scribed_text: assembled,
      raw_spoken_text: componentText,
      position: paragraphIndex,
      paragraph_index: paragraphIndex,
      paragraph_type: paragraphType,
      is_thin: false,
    }, { onConflict: 'session_id,position' })
    .select()
    .single()

  // Unique index paragraphs(session_id, position) exists as of migration 027 —
  // the upsert is authoritative; a failure here is a real error, not a missing
  // constraint (the old insert fallback was creating duplicate rows).
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ assembled, paragraph: para })
}
