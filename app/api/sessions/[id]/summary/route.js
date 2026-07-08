import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicUsage } from '@/lib/usage'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { canUseCoach, coachGateResponse } from '@/lib/coppa'

const anthropic = new Anthropic()

function extractJSON(text) {
  // Try direct parse first
  try { return JSON.parse(text) } catch {}
  // Extract the first [...] block from the response
  const match = text.match(/\[[\s\S]*\]/)
  if (match) {
    try { return JSON.parse(match[0]) } catch {}
  }
  return null
}

export async function POST(request, { params }) {
  const { id } = await params
  const { assignmentText } = await request.json()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: gate } = await supabase
    .from('profiles').select('role, age_bracket, coppa_consent_required, coppa_consent_given').eq('id', user.id).single()
  if (!canUseCoach(gate)) return coachGateResponse()

  if (!await checkRateLimit(`summary:${user.id}`, 20, 60)) return rateLimited()

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: 'You are a precise JSON generator. You output ONLY valid JSON arrays — no explanation, no markdown, no code fences.',
    messages: [{
      role: 'user',
      content: `Extract the key requirements from this assignment into a JSON array. Each item must have "label" (short category like "Format", "Topic", "Must include", "Length", "Goal") and "detail" (concise value). 3–6 bullets max, only include what is explicitly stated.

Output format:
[
  { "label": "Format", "detail": "5-paragraph essay (introduction, 3 body paragraphs, conclusion)" },
  { "label": "Topic", "detail": "Your favorite season and why you love it" },
  { "label": "Must include", "detail": "Thesis statement, one specific detail per body paragraph, transition words" },
  { "label": "Length", "detail": "300–400 words" }
]

Assignment:
${assignmentText}`,
    }],
  })

  logAnthropicUsage({ model: 'claude-haiku-4-5-20251001', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, sessionId: id, userId: user.id })

  const raw = response.content[0].text.trim()
  const summary = extractJSON(raw)

  if (!summary) {
    console.error('[summary] Failed to parse Haiku response:', raw)
    return Response.json({ error: 'Parse failed', raw }, { status: 500 })
  }

  // Save to DB (best-effort — column may not exist yet if migration hasn't run)
  await supabase
    .from('sessions')
    .update({ assignment_summary: summary })
    .eq('id', id)
    .eq('student_id', user.id)

  return Response.json({ summary })
}
