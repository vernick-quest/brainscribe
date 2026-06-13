import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { logAnthropicUsage } from '@/lib/usage'

const anthropic = new Anthropic()

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { paragraphs, thesis } = await request.json()
  // paragraphs: [{ index, type, text }, ...]

  if (!paragraphs?.length) return Response.json({ error: 'No paragraphs provided' }, { status: 400 })

  const paragraphBlock = paragraphs
    .map((p, i) => `Paragraph ${i + 1}${p.type ? ` (${p.type})` : ''}:\n${p.text}`)
    .join('\n\n')

  const thesisNote = thesis ? `\nThe student's thesis is: "${thesis}"\n` : ''

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: `You are a faithful editor. Your only job is to smooth the transitions between the provided paragraphs into a cohesive essay.

STRICT RULES:
- Use ONLY the ideas and words provided in the paragraphs.
- Do NOT add new arguments, evidence, examples, or ideas.
- You may adjust transition words at paragraph boundaries only — where one paragraph ends and the next begins.
- Do NOT remove any of the student's ideas.
- Preserve the student's natural voice and vocabulary exactly.
- Output ONLY the assembled essay — no commentary, no labels, no preamble.`,
    messages: [{
      role: 'user',
      content: `${thesisNote}Smooth these paragraphs into a cohesive essay:\n\n${paragraphBlock}`,
    }],
  })

  logAnthropicUsage({ model: 'claude-haiku-4-5-20251001', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, userId: user.id })
  return Response.json({ assembled: response.content[0].text.trim() })
}
