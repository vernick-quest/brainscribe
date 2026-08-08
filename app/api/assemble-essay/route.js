import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { logAnthropicUsage } from '@/lib/usage'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { COACH_GATE_COLUMNS, coachGateFailure } from '@/lib/access'

const anthropic = new Anthropic()

// POST /api/assemble-essay
// Smooths the transitions between a student's finished paragraphs into one cohesive
// essay. The paragraphs are re-read from the DB by sessionId (RLS/owner-scoped, same
// pattern as /api/sessions/[id]/complete and the transcript page) — NEVER trusted from
// the request body. This closes an API-level ghostwriting side door: previously any
// logged-in account could POST arbitrary "paragraphs" and get Haiku to write prose the
// coach never saw and the transcript never recorded (fragility audit B2). The model is
// still constrained to a faithful transitions-only edit of the student's own material.
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Coach reachability gate (lib/access.js) — assembling prose is a model call in the
  // coached flow, so an unconsented under-13 OR an authed user with no Beta access
  // must not reach it. (Ownership of the session is separately enforced below.)
  const { data: gate } = await supabase
    .from('profiles').select(COACH_GATE_COLUMNS).eq('id', user.id).single()
  const gateFail = coachGateFailure(gate)
  if (gateFail) return gateFail

  if (!await checkRateLimit(`assemble-essay:${user.id}`, 10, 60)) return rateLimited()

  const { sessionId } = await request.json()
  if (!sessionId) return Response.json({ error: 'Missing sessionId' }, { status: 400 })

  // Ownership check — RLS also scopes the reads below, but this gives a clean 404 and
  // mirrors the complete route. A student can only ever assemble their OWN session.
  const { data: session } = await supabase
    .from('sessions')
    .select('id, student_id')
    .eq('id', sessionId)
    .single()
  if (!session || session.student_id !== user.id) {
    return Response.json({ error: 'Not found.' }, { status: 404 })
  }

  // Re-read the student's saved paragraphs (their own written material) and thesis
  // straight from the DB — the body is never a source of prose.
  const [{ data: paraRows }, { data: scaffold }] = await Promise.all([
    supabase
      .from('paragraphs')
      .select('scribed_text, position, paragraph_index, paragraph_type')
      .eq('session_id', sessionId)
      .order('position'),
    supabase
      .from('paragraph_scaffolds')
      .select('thesis')
      .eq('session_id', sessionId)
      .single(),
  ])

  const paragraphs = (paraRows ?? []).filter(p => p.scribed_text?.trim())
  if (!paragraphs.length) return Response.json({ error: 'No saved paragraphs to assemble.' }, { status: 400 })

  const paragraphBlock = paragraphs
    .map((p, i) => `Paragraph ${i + 1}${p.paragraph_type ? ` (${p.paragraph_type})` : ''}:\n${p.scribed_text}`)
    .join('\n\n')

  const thesis = scaffold?.thesis?.trim()
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
