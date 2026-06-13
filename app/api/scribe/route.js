import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { scribeSystemPrompt } from '@/lib/prompts'
import { logAnthropicUsage } from '@/lib/usage'

const anthropic = new Anthropic()

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { spokenText, sessionId, activeChecklist = [] } = await request.json()

  if (!spokenText || !sessionId) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Build checklist detection instruction if there are unchecked items
  const uncheckedItems = activeChecklist.filter(item => !item.checked).map(item => item.label)
  const checklistInstruction = uncheckedItems.length > 0
    ? `\n\nCHECKLIST DETECTION: After scribing, also detect which of these essay elements the student addressed in their response. Only mark items the student clearly expressed — not implied or assumed. Include as "checklistUpdates": an array of label strings from this list that were addressed: ${JSON.stringify(uncheckedItems)}. If none were addressed, return [].`
    : ''

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: scribeSystemPrompt() + checklistInstruction,
    messages: [
      { role: 'user', content: `Raw spoken answer:\n\n${spokenText}` }
    ],
  })

  logAnthropicUsage({ model: 'claude-haiku-4-5-20251001', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, sessionId, userId: user.id })

  let result
  try {
    result = JSON.parse(response.content[0].text)
  } catch {
    // Try extracting JSON if there's surrounding text
    const match = response.content[0].text.match(/\{[\s\S]*\}/)
    if (match) {
      try { result = JSON.parse(match[0]) } catch {}
    }
    if (!result) return Response.json({ error: 'Scribe parse error' }, { status: 500 })
  }

  // Ensure checklistUpdates is always an array
  if (!Array.isArray(result.checklistUpdates)) result.checklistUpdates = []

  return Response.json(result)
}
