import { createClient } from '@/lib/supabase/server'

// GET — fetch scaffold for a session
export async function GET(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params
  const { data } = await supabase
    .from('paragraph_scaffolds')
    .select('*')
    .eq('session_id', sessionId)
    .single()

  return Response.json(data ?? null)
}

// POST — create scaffold (called when coach emits [SCAFFOLD:type:count])
export async function POST(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params
  const { assignmentType, totalParagraphs, components } = await request.json()

  const { data, error } = await supabase
    .from('paragraph_scaffolds')
    .upsert({
      session_id: sessionId,
      assignment_type: assignmentType,
      total_paragraphs: totalParagraphs,
      current_paragraph_index: 0,
      components,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

// PATCH — update scaffold state (component status, thesis, paragraph progress)
export async function PATCH(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params
  const body = await request.json()

  // body can include: components, thesis, current_paragraph_index
  const update = { updated_at: new Date().toISOString() }
  if (body.components !== undefined)              update.components = body.components
  if (body.thesis !== undefined)                  update.thesis = body.thesis
  if (body.current_paragraph_index !== undefined) update.current_paragraph_index = body.current_paragraph_index

  const { data, error } = await supabase
    .from('paragraph_scaffolds')
    .update(update)
    .eq('session_id', sessionId)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Mirror thesis to sessions table for easy access
  if (body.thesis) {
    await supabase
      .from('sessions')
      .update({ thesis_statement: body.thesis, thesis_confirmed: true })
      .eq('id', sessionId)
  }

  return Response.json(data)
}
