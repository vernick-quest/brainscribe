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

  if (error) {
    // onConflict may not exist on this table yet — fall back to insert
    const { data: para2, error: err2 } = await supabase
      .from('paragraphs')
      .insert({
        session_id: sessionId,
        scribed_text: assembled,
        raw_spoken_text: componentText,
        position: paragraphIndex,
        paragraph_index: paragraphIndex,
        paragraph_type: paragraphType,
        is_thin: false,
      })
      .select()
      .single()
    if (err2) return Response.json({ error: err2.message }, { status: 500 })
    return Response.json({ assembled, paragraph: para2 })
  }

  return Response.json({ assembled, paragraph: para })
}
