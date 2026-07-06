import Anthropic from '@anthropic-ai/sdk'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCoachSystemBlocks } from '@/lib/prompts'
import { recordAnthropicUsage } from '@/lib/usage'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { canUseCoach, coachGateResponse, ageInYears } from '@/lib/coppa'
import { getSkill, getGradeBand } from '@/lib/gymCurriculum'
import { getChallenge } from '@/lib/gymChallengeBank'

const anthropic = new Anthropic()

// Streaming gym coach. Mirrors /api/tutor exactly (cached static prefix + dynamic
// tail, inline token protocol, usage logging) — the ONLY delta is the gym-mode block
// injected into the dynamic tail (opts.gym). Same Sonnet model, same guardrails, same
// stream tokens. Kept as its own route so gym prompt changes never touch assignment
// mode and vice-versa (coach-prompt lane isolation).
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await checkRateLimit(`gym-tutor:${user.id}`, 40, 60)) return rateLimited()
  if (!await checkRateLimit(`gym-tutor:day:${user.id}`, 600, 86400)) {
    return rateLimited("You've reached today's coaching limit — it resets tomorrow.")
  }

  // COPPA coach age gate — re-checked here, not just at session creation (RLS lets a
  // student insert rows directly). Admins pass (remote-in runs as admin).
  const { data: gate } = await supabase
    .from('profiles').select('role, age_bracket, coppa_consent_required, coppa_consent_given, birthdate').eq('id', user.id).single()
  if (!canUseCoach(gate)) return coachGateResponse()

  const { sessionId, messages, persona = 'owen', scaffold = null } = await request.json()
  if (!sessionId || !messages) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Re-read the challenge prompt from the DB via RLS (never trust the request body —
  // existing invariant). The gym_sessions row carries the skill; the linked sessions
  // row carries the challenge prompt text (its assignment_text).
  const { data: sessionRow } = await supabase
    .from('sessions').select('assignment_text, gym_session_id').eq('id', sessionId).single()
  if (!sessionRow?.gym_session_id) {
    return Response.json({ error: 'Not a gym session' }, { status: 400 })
  }
  const { data: gymSession } = await supabase
    .from('gym_sessions').select('skill_key, tier, session_type').eq('id', sessionRow.gym_session_id).single()

  const isWarmup = gymSession?.session_type === 'warmup'
  const skill = getSkill(gymSession?.skill_key)
  const challengePrompt = sessionRow.assignment_text ?? ''

  // Coach-only guidance for this skill+band (skill-check bar + anti-gaming note) —
  // steers what the coach probes for; never read out to the student as rules.
  const age = gate?.birthdate ? ageInYears(new Date(gate.birthdate), new Date()) : null
  const band = getGradeBand({ age, ageBracket: gate?.age_bracket })
  const card = skill ? getChallenge(skill.key, band) : null

  const filtered = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(({ role, content }) => ({ role, content }))
  const firstUser = filtered.findIndex(m => m.role === 'user')
  const cleanedMessages = firstUser > 0 ? filtered.slice(firstUser) : filtered

  const { staticPrefix, dynamicTail } = buildCoachSystemBlocks(persona, challengePrompt, scaffold, {
    gym: isWarmup ? { warmup: true } : {
      skillLabel: skill?.label ?? 'this skill',
      skillDescription: skill?.description ?? '',
      tier: gymSession?.tier ?? skill?.tier ?? 1,
      outputType: skill?.output_type ?? 'paragraph',
      skillCheck: card?.skillCheck ?? null,
      gamingNote: card?.gamingNote ?? null,
    },
  })

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
      if (error) console.error('[gym/tutor] message insert failed:', error.message)
    }
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
