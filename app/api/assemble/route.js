import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { logAnthropicUsage } from '@/lib/usage'

const anthropic = new Anthropic()

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, paragraphIndex, paragraphType, components } = await request.json()
  // components: [{ id, label, text }, ...]

  const componentText = components
    .filter(c => c.text?.trim())
    .map(c => `${c.label}: ${c.text}`)
    .join('\n\n')

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: `You are a faithful scribe. Your only job is to flow the provided paragraph components into a single, cohesive paragraph.

STRICT RULES:
- Use ONLY the ideas and words provided in the components.
- Do NOT add arguments, transitions, evidence, or ideas that do not appear in the components.
- Do NOT remove any of the student's ideas.
- Fix obvious spelling errors and smooth transitions between components — that is all.
- Preserve the student's natural voice and vocabulary.
- Output ONLY the assembled paragraph — no commentary, no labels, no preamble.`,
    messages: [{
      role: 'user',
      content: `Assemble these ${paragraphType} paragraph components into a single flowing paragraph:\n\n${componentText}`,
    }],
  })

  logAnthropicUsage({ model: 'claude-haiku-4-5-20251001', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, sessionId, userId: user.id })

  const assembled = response.content[0].text.trim()

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
