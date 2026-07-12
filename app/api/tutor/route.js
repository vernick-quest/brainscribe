import Anthropic from '@anthropic-ai/sdk'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCoachSystemBlocks } from '@/lib/prompts'
import { sessionCoachContribution } from '@/lib/scaffoldProvenance'
import { recordAnthropicUsage } from '@/lib/usage'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { canUseCoach, coachGateResponse } from '@/lib/coppa'

const anthropic = new Anthropic()

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await checkRateLimit(`tutor:${user.id}`, 40, 60)) return rateLimited()
  // Daily per-account backstop against runaway/abuse cost (fails open).
  if (!await checkRateLimit(`tutor:day:${user.id}`, 600, 86400)) {
    return rateLimited("You've reached today's coaching limit — it resets tomorrow.")
  }

  // COPPA coach age gate (lib/coppa.js) — re-checked here, not just at session
  // creation: RLS lets a student insert a sessions row directly (client-side
  // supabase-js), which would otherwise skip /api/sessions' gate and let an
  // unconsented under-13 talk to the coach. Admins pass (remote-in runs as admin).
  const { data: gate } = await supabase
    .from('profiles').select('role, age_bracket, coppa_consent_required, coppa_consent_given').eq('id', user.id).single()
  if (!canUseCoach(gate)) return coachGateResponse()

  const { sessionId, messages, assignment, persona = 'owen', scaffold = null, resume = false } = await request.json()

  if (!sessionId || !messages || !assignment) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Source the assignment from the DB rather than trusting the client. The user
  // client + RLS returns the row only if the caller may read this session, so a
  // student can't run the coach against arbitrary text on someone else's session.
  // Falls back to the body when RLS doesn't grant a read (e.g. an admin who is
  // impersonating a student) — an acceptable trust boundary since admins are trusted.
  const { data: sessionRow } = await supabase
    .from('sessions').select('assignment_text, is_onboarding, requirements').eq('id', sessionId).single()
  const effectiveAssignment = sessionRow?.assignment_text ?? assignment
  // Read the practice flag from the DB, not the client — the onboarding coaching
  // tone is server-authoritative.
  const isOnboarding = sessionRow?.is_onboarding === true

  // Claude API only allows 'user' and 'assistant' roles, and the first message must be 'user'.
  // The local greeting is never saved to the DB, so the history sent from the client can start
  // with an assistant message — strip any leading assistant messages and unknown fields.
  const filtered = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(({ role, content }) => ({ role, content }))
  const firstUser = filtered.findIndex(m => m.role === 'user')
  const cleanedMessages = firstUser > 0 ? filtered.slice(firstUser) : filtered

  // Split the system prompt: the large static prefix (persona + rules + guardrails,
  // ~5.7k tokens, identical every turn) is marked for Anthropic prompt caching so it
  // bills at ~10% on cache hits. Only the small assignment/scaffold tail varies.
  // `resume` is a client-supplied signal set by the coaching-session lane on the
  // FIRST turn of a genuinely resumed session (a real gap elapsed, banked progress
  // exists). It only steers the coach's uncached tail (don't re-greet, read progress
  // from scaffold state) — it grants no data access, so trusting the client here is
  // safe; the scaffold itself is still the source of truth for what's actually locked.
  // Lever B integration bridge (conductor, 2026-07-12): coaching-session annotates
  // per-component provenance into the scaffold JSON at lock time; derive the
  // session-level coach-contribution ratio here so buildCoachSystemBlocks can surface
  // it (it reads scaffold.coachContribRatio, which no lane populated — the seam).
  // Only set once a lock has been scored, so a fresh session never surfaces "0%".
  // Phase-1 display nudge computed from the client-echoed annotated scaffold; the
  // Phase-2 hard gate must recompute from the DB scaffold, not the request body.
  if (scaffold && !Number.isFinite(scaffold.coachContribRatio)) {
    const agg = sessionCoachContribution(scaffold.components ?? [])
    if (agg.checkedCount > 0) scaffold.coachContribRatio = agg.coachContribRatio
  }

  const { staticPrefix, dynamicTail } = buildCoachSystemBlocks(persona, effectiveAssignment, scaffold, { onboarding: isOnboarding, requirements: sessionRow?.requirements, resume: resume === true })

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: [
      { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicTail },
    ],
    messages: cleanedMessages,
  })

  const encoder = new TextEncoder()
  const TOKEN_RE = /\[(SCAFFOLD|ACTIVE|NUGGET|DONE|THESIS|PARA_DONE):[^\]]*\]|\[COMPLETE\]/g

  // The stream's text tokens are enqueued to the client as they arrive, then the
  // stream closes immediately. The usage log + message insert run in after(), so the
  // client's read loop is no longer held open waiting on two DB round trips. after()
  // keeps the serverless function alive until those writes complete.
  let resolveResult
  const resultReady = new Promise(resolve => { resolveResult = resolve })

  const readable = new ReadableStream({
    async start(controller) {
      let fullText = ''
      let inputTokens = 0
      let outputTokens = 0
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'message_start') inputTokens = chunk.message.usage?.input_tokens ?? 0
          if (chunk.type === 'message_delta')  outputTokens = chunk.usage?.output_tokens ?? 0
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullText += chunk.delta.text
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      } finally {
        const savedText = fullText.replace(TOKEN_RE, '').replace(/\[DICTATE\]/g, '').trim()
        resolveResult({ inputTokens, outputTokens, savedText })
      }
    },
  })

  after(async () => {
    const { inputTokens, outputTokens, savedText } = await resultReady
    await recordAnthropicUsage({ model: 'claude-sonnet-4-6', inputTokens, outputTokens, sessionId, userId: user.id })
    if (savedText) {
      const { error } = await supabase.from('messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: savedText,
      })
      if (error) console.error('[tutor] message insert failed:', error.message)
      // Touch last-activity for the resume time-gate (mirrors /api/messages). A coach
      // turn is activity too. Owner-scoped via RLS; non-fatal.
      const { error: touchErr } = await supabase
        .from('sessions')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', sessionId)
      if (touchErr) console.error('[tutor] last_active_at touch failed:', touchErr.message)
    }
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
