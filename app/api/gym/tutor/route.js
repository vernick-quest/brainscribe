import Anthropic from '@anthropic-ai/sdk'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildCoachSystemBlocks } from '@/lib/prompts'
import { recordAnthropicUsage } from '@/lib/usage'
import { COACH_MODEL, requestOptionsFor, coachMaxTokens } from '@/lib/models'
import { createCoachStreamReader, coachTurnAbandoned } from '@/lib/coachStream'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { ageInYears } from '@/lib/coppa'
import { COACH_GATE_COLUMNS, coachGateFailure } from '@/lib/access'
import { getSkill, getGradeBand } from '@/lib/gymCurriculum'
import { getChallenge } from '@/lib/gymChallengeBank'
import { hasLandedLockToken, stripCoachTokens } from '@/lib/coachTokens'

const anthropic = new Anthropic()

// Streaming gym coach. Mirrors /api/tutor (cached static prefix + dynamic tail, inline
// token protocol, usage logging) — the intended delta is the gym-mode block injected into
// the dynamic tail (opts.gym). Same Sonnet model, same guardrails, same stream tokens.
// Kept as its own route so gym prompt changes never touch assignment mode and vice-versa
// (coach-prompt lane isolation).
//
// ⚠️ "MIRRORS EXACTLY" IS A CLAIM THAT ROTS, AND IT DID. This header used to say the gym
// block was the ONLY delta. By 2026-08-16 the file had also drifted into: a max_tokens
// ceiling left at 1000 after the assignment path went to 4000, no stop_reason check at
// all, and its own copy of the token-strip regex that was missing [CARE] and [SOURCE]. So
// Sierra's exact data-loss chain — oversized [DONE:] payload, turn cut mid-payload, lock
// silently never parsed — was live in Skill Studio and, with no truncation counter here,
// invisible in a way the assignment path no longer was. Lane isolation duplicates the
// FILE; it must not duplicate the SAFETY LOGIC. Anything shared now comes from
// lib/coachTokens.js, and any new guard on /api/tutor belongs here in the same change.
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await checkRateLimit(`gym-tutor:${user.id}`, 40, 60)) return rateLimited()
  if (!await checkRateLimit(`gym-tutor:day:${user.id}`, 600, 86400)) {
    return rateLimited("You've reached today's coaching limit — it resets tomorrow.")
  }

  // Coach reachability gate (lib/access.js) — re-checked here, not just at session
  // creation (RLS lets a student insert rows directly). Enforces BOTH COPPA and the
  // Beta access gate. birthdate is an endpoint-specific extra (grade band below).
  // Admins pass (remote-in runs as admin). Fails CLOSED on a missing/odd access_granted.
  const { data: gate } = await supabase
    .from('profiles').select(`${COACH_GATE_COLUMNS}, birthdate`).eq('id', user.id).single()
  const gateFail = coachGateFailure(gate)
  if (gateFail) return gateFail

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
    model: COACH_MODEL,
    // Same per-model fields as /api/tutor (lib/models.js) — effort 'low' on Opus 5.5.
    ...requestOptionsFor(COACH_MODEL),
    // Matches /api/tutor deliberately. This ceiling is not "how much may the coach say" —
    // a [DONE:id:…] payload carries the STUDENT'S EXACT WORDS, so it is really "how long
    // may a piece of their writing be". Billed on actual output, so ordinary turns are
    // unaffected. Skill Studio pieces are shorter than essays, which is exactly why this
    // sat unnoticed at 1000; shorter is not short. Sized per model in lib/models.js
    // (8000 on Opus 5.5: bigger tokenizer + thinking spends from the same ceiling).
    max_tokens: coachMaxTokens(COACH_MODEL),
    system: [
      { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicTail },
    ],
    messages: cleanedMessages,
  })

  const encoder = new TextEncoder()

  let resolveResult
  const resultReady = new Promise(resolve => { resolveResult = resolve })
  // Set by cancel() below: the client went away before the turn was fully sent.
  let clientCancelled = false

  const readable = new ReadableStream({
    async start(controller) {
      // Same reader as /api/tutor (lib/coachStream.js): only text_delta reaches the client;
      // Opus 5.5's thinking/signature deltas are dropped. Counts cache tokens + stop_reason.
      const reader = createCoachStreamReader()
      const st = reader.state
      try {
        for await (const chunk of stream) {
          const text = reader.consume(chunk)
          if (text) controller.enqueue(encoder.encode(text))
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      } finally {
        const { fullText, stopReason } = st
        // Same discriminator as /api/tutor: a truncated turn that landed NO lock is the
        // one that may have destroyed confirmed student words. The student already saw
        // the text, so we still deliver and persist it — what we refuse is to treat a
        // truncated turn as a clean one.
        const savedText = stripCoachTokens(fullText)
        resolveResult({
          usage: { inputTokens: st.inputTokens, outputTokens: st.outputTokens, cacheWriteTokens: st.cacheWriteTokens, cacheReadTokens: st.cacheReadTokens },
          savedText, stopReason, chars: fullText.length,
          truncated: stopReason === 'max_tokens',
          hadLockToken: hasLandedLockToken(fullText),
        })
      }
    },
    // The client aborted (TutorSession's 45s no-first-text / stalled-stream timeout, or the
    // student navigated away). Next 16 cancels this source stream when the response closes
    // early. Stop the model too — Opus output is $20/MTok for words nobody will read — which
    // also ends the read loop above, so finally{} resolves the result promptly.
    cancel() {
      clientCancelled = true
      try { stream.abort() } catch {}
    },
  })

  after(async () => {
    const { usage, savedText, truncated, hadLockToken, stopReason, chars } = await resultReady
    await recordAnthropicUsage({ model: COACH_MODEL, ...usage, sessionId, userId: user.id })

    // A safety-classifier decline is a 200 with stop_reason 'refusal': the stream simply
    // ends, possibly mid-sentence. Same reasoning as /api/tutor — loud, never a short reply.
    if (stopReason === 'refusal') {
      console.error(
        `[gym/tutor] 🔴 MODEL REFUSAL (stop_reason=refusal) session=${sessionId} model=${COACH_MODEL} ` +
        `chars_streamed=${chars} lock_token_present=${hadLockToken} — the coach turn ended without a full reply`
      )
    }

    // Truncation, recorded against the SAME counter as the assignment path. `sessionId`
    // here is the linked `sessions` row (re-read via RLS and confirmed a gym session
    // above), which is what record_coach_turn_truncation keys on — so gym truncation
    // lands in one place with essay truncation instead of being a second dark corner.
    // Service client because the counter is a safety signal: a user-callable RPC on an
    // arbitrary session id would be forgeable. Granted to service_role alone.
    if (truncated) {
      console.error(
        `[gym/tutor] TRUNCATED coach turn (stop_reason=${stopReason}) session=${sessionId} ` +
        `lock_token_present=${hadLockToken} — ${hadLockToken ? 'tokens emitted before the cut' : 'NO landed lock: a [DONE]/[CARE] may have been dropped'}`
      )
      const { error: truncErr } = await createServiceClient().rpc('record_coach_turn_truncation', {
        p_session_id: sessionId,
        p_had_lock_token: hadLockToken,
      })
      if (truncErr) console.error('[gym/tutor] truncation record failed:', truncErr.message)
    }
    // An ABANDONED turn writes nothing but its usage (above) and any truncation record:
    // the client aborts a stalled turn and applies NOTHING from it, so the partial coach
    // message must not reappear on reload. Same rule as /api/tutor (coachTurnAbandoned).
    const abandoned = coachTurnAbandoned({ streamCancelled: clientCancelled, signalAborted: request.signal?.aborted === true, stopReason })
    if (abandoned) {
      console.warn(`[gym/tutor] client ABORTED the turn mid-stream session=${sessionId} chars_streamed=${chars} stream_cancelled=${clientCancelled} — not persisting the partial coach message`)
      return
    }
    if (savedText) {
      // Persist the coach turn via the SERVICE-ROLE client, not the student's RLS
      // client. This is the gym-lane half of audit finding E1: the `messages` table
      // grants session owners FOR ALL with no role check, so a student's own client
      // could forge role:'assistant' rows (poisoning transcripts parents/teachers and
      // the audit judge read). Routing every authenticated assistant/system insert
      // through the service client is the prerequisite for the restrictive
      // `with check (role='user')` policy infra will ship once all four inserts move
      // (the other three live in coach-ai's routes). Ownership is already enforced
      // above: sessionId was re-read via RLS and confirmed to be a gym session.
      const service = createServiceClient()
      const { error } = await service.from('messages').insert({
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
