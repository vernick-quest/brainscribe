import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { scribeSystemPrompt } from '@/lib/prompts'

const anthropic = new Anthropic()

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { spokenText, sessionId } = await request.json()

  if (!spokenText || !sessionId) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: scribeSystemPrompt(),
    messages: [
      { role: 'user', content: `Raw spoken answer:\n\n${spokenText}` }
    ],
  })

  let result
  try {
    result = JSON.parse(response.content[0].text)
  } catch {
    return Response.json({ error: 'Scribe parse error' }, { status: 500 })
  }

  return Response.json(result)
}
