import { createClient } from '@/lib/supabase/server'
import { assembleParagraphText } from '@/lib/assembleParagraph'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, paragraphIndex, paragraphType, components } = await request.json()
  // components: [{ id, label, text }, ...]

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
