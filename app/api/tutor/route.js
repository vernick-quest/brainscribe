import Anthropic from '@anthropic-ai/sdk'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildCoachSystemBlocks } from '@/lib/prompts'
import { sessionCoachContribution } from '@/lib/scaffoldProvenance'
import { recordAnthropicUsage } from '@/lib/usage'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { COACH_GATE_COLUMNS, coachGateFailure } from '@/lib/access'
import { parseCommitments } from '@/lib/coachCommitments'

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

  // Coach reachability gate (lib/access.js) — re-checked here, not just at session
  // creation: RLS lets a student insert a sessions row directly (client-side
  // supabase-js), which would otherwise skip /api/sessions' gate and let an
  // unconsented under-13 — OR an authed 13+ user with no Beta access — talk to the
  // coach. Enforces BOTH COPPA and access_granted. Admins pass (remote-in runs as
  // admin). Fails CLOSED on a missing/odd access_granted.
  const { data: gate } = await supabase
    .from('profiles').select(COACH_GATE_COLUMNS).eq('id', user.id).single()
  const gateFail = coachGateFailure(gate)
  if (gateFail) return gateFail

  const { sessionId, messages, assignment, persona = 'owen', scaffold = null, resume = false } = await request.json()

  if (!sessionId || !messages || !assignment) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Source the assignment from the DB rather than trusting the client. The user
  // client + RLS returns the row only if the caller may read this session, so a
  // student can't run the coach against arbitrary text on someone else's session.
  // The fallback to the request-body `assignment` exists ONLY for a real admin who
  // is impersonating a student (RLS returns null for the admin reading the student's
  // row). For any NON-admin an RLS-null read means "not yours" — reject rather than
  // run the model on attacker-supplied text (previously any non-owner fell through
  // to the body). Admins are trusted; the impersonation path is preserved.
  const BASE_COLS = 'assignment_text, is_onboarding, requirements'
  // `continued_from` arrives with migration 057, which is applied BY HAND — so this
  // deploy can land first. PostgREST answers a select naming a missing column with an
  // ERROR and data:null, and a null sessionRow sends every non-admin down the 404
  // branch below: shipping this unguarded would take the coach offline for every
  // student until someone pasted the SQL. Same fail-soft shape as the migration-056
  // handling in the commitment writer further down.
  let { data: sessionRow, error: sessionErr } = await supabase
    .from('sessions').select(`${BASE_COLS}, continued_from`).eq('id', sessionId).single()
  // 42703 = undefined_column, i.e. 057 hasn't been pasted yet. Retry ONLY on that —
  // an RLS-filtered/not-found read also sets `error` (PGRST116) and must keep falling
  // through to the admin-impersonation branch below without a wasted second query.
  if (sessionErr?.code === '42703') {
    console.error('[tutor] sessions.continued_from missing (migration 057 unapplied) — continuation coaching is OFF until it is applied')
    ;({ data: sessionRow } = await supabase
      .from('sessions').select(BASE_COLS).eq('id', sessionId).single())
  }
  let effectiveAssignment
  if (sessionRow?.assignment_text != null) {
    effectiveAssignment = sessionRow.assignment_text
  } else if (gate?.role === 'admin') {
    effectiveAssignment = assignment                       // admin impersonation path
  } else {
    return Response.json({ error: 'Not found.' }, { status: 404 })
  }
  // Read the practice flag from the DB, not the client — the onboarding coaching
  // tone is server-authoritative.
  const isOnboarding = sessionRow?.is_onboarding === true
  // "Keep working on this" v2 (migration 057). Server-derived, NOT client-supplied,
  // deliberately unlike `resume` below: this flag tells the coach NOT to emit
  // [COMPLETE] on an all-complete scaffold, so a client that could set it could
  // suppress a legitimate completion on an ordinary session. `continued_from` is
  // written only by /api/sessions/[id]/continue and is trigger-guarded to a session
  // the same student owns. Null/absent (incl. pre-migration, and the admin
  // impersonation path where RLS returns no row) → false → today's behavior exactly.
  const isContinuation = sessionRow?.continued_from != null

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

  const { staticPrefix, dynamicTail } = buildCoachSystemBlocks(persona, effectiveAssignment, scaffold, { onboarding: isOnboarding, requirements: sessionRow?.requirements, resume: resume === true, continuation: isContinuation })

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
  // [CARE] is the out-of-band child-safety signal (see child-safety-redteam-spec).
  // It MUST be stripped here before the coach turn is persisted to `messages`: a
  // linked watcher (who may be the very adult a child needs help from) can read
  // that table, so the disclosure signal can never land in it. The card it drives
  // is rendered client-side only, from local state (components/CrisisResourceCard).
  // NOTE: the emitter (coach Guardrail 18 / deterministic screen) is the coach-ai
  // lane's to build — this strip is the safety backstop regardless of when it lands.
  // [SOURCE:…] is the research/citations capture token (coaching-session lane): it
  // opens the source-confirm card client-side and must be stripped from the persisted
  // coach turn like every other control token.
  const TOKEN_RE = /\[(SCAFFOLD|ACTIVE|NUGGET|DONE|THESIS|PARA_DONE|SOURCE):[^\]]*\]|\[COMPLETE\]|\[CARE\]/g

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
      let stopReason = null
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'message_start') inputTokens = chunk.message.usage?.input_tokens ?? 0
          if (chunk.type === 'message_delta') {
            outputTokens = chunk.usage?.output_tokens ?? 0
            // stop_reason arrives on message_delta. 'max_tokens' means the model was
            // CUT OFF mid-turn — see the truncation note below.
            if (chunk.delta?.stop_reason) stopReason = chunk.delta.stop_reason
          }
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
        // ── Truncation detection (audit finding 2026-08-09) ────────────────────
        // EVERY control token is emitted at the END of a coach turn ([DONE:id:words],
        // [PARA_DONE], [THESIS], [COMPLETE], [CARE]). A turn cut off at max_tokens can
        // therefore silently drop a LOCK — the student's confirmed text never reaches
        // the Draft, the scaffold-data-loss signature — or a [CARE], so the crisis card
        // never renders. 6 of 18 audited sessions reported truncated turns and nothing
        // could distinguish "dropped a lock" from "merely cut prose": that blindness IS
        // the defect, so detect and record the DISCRIMINATOR before touching the ceiling.
        // We still deliver + persist the text (the student already saw it); what we
        // refuse to do is treat a truncated turn as a clean, complete turn.
        const truncated = stopReason === 'max_tokens'
        const hadLockToken = /\[(DONE|THESIS|PARA_DONE|COMPLETE|CARE)[:\]]/.test(fullText)
        resolveResult({ inputTokens, outputTokens, savedText, rawText: fullText, truncated, hadLockToken, stopReason })
      }
    },
  })

  after(async () => {
    const { inputTokens, outputTokens, savedText, rawText, truncated, hadLockToken, stopReason } = await resultReady
    await recordAnthropicUsage({ model: 'claude-sonnet-4-6', inputTokens, outputTokens, sessionId, userId: user.id })

    // A truncated coach turn is never "just a long answer" — log loudly and record it
    // so the audit can tell a dropped lock from cut prose. no_lock is the discriminator:
    // truncated WITHOUT any control token is the case that may have destroyed a lock.
    if (truncated) {
      console.error(
        `[tutor] TRUNCATED coach turn (stop_reason=${stopReason}) session=${sessionId} ` +
        `lock_token_present=${hadLockToken} — ${hadLockToken ? 'tokens emitted before the cut' : 'NO control token: a [DONE]/[CARE] may have been dropped'}`
      )
      // SERVICE client, not the user-scoped one: the counter is a SAFETY SIGNAL — the
      // number we use to decide whether truncation is eating locks — so it must not be
      // callable (and therefore forgeable) by a signed-in user against an arbitrary
      // session. Server-side writer only; the fn is granted to service_role alone.
      const { error: truncErr } = await createServiceClient().rpc('record_coach_turn_truncation', {
        p_session_id: sessionId,
        p_had_lock_token: hadLockToken,
      })
      if (truncErr) console.error('[tutor] truncation record failed:', truncErr.message)
    }

    // Record what the coach PROMISED it saved, from the raw stream before the tokens are
    // stripped. Deliberately a different path from the client-side scaffold write it will
    // later be reconciled against: if the same code recorded both, a dropped write would
    // drop its own evidence — which is how two silent-drop bugs went a month unnoticed.
    // Service role, because a client that could forge or delete a commitment could hide
    // its own loss. Never blocks or fails the turn.
    try {
      const { components, inlineText } = parseCommitments(rawText)
      if (components.length) {
        const svc = createServiceClient()
        // Carry the inline words too (migration 056). Without them a broken promise is
        // provable but unrecoverable.
        //
        // TWO calls, deliberately. postgrest-js builds the column list from the UNION of
        // all rows' keys and defaults missing values to NULL, so a single mixed call —
        // [DONE:body] bare alongside [DONE:closing:text] — would write inline_text = NULL
        // over the stored body text. Re-emitting a bare DONE in a recap is normal, so the
        // feature meant to preserve the last copy of a student's words would have been the
        // thing that erased it.
        const withText = components.filter(id => inlineText[id])
        const withoutText = components.filter(id => !inlineText[id])

        if (withText.length) {
          const { error } = await svc.from('coach_commitments').upsert(
            withText.map(component_id => ({
              session_id: sessionId, component_id, inline_text: inlineText[component_id],
            })),
            { onConflict: 'session_id,component_id' },
          )
          if (error) {
            // Migration 056 is applied BY HAND, so this deploy can land first. Losing the
            // recovery text is a downgrade; losing the commitment itself would blind the
            // detector entirely. Fall back to recording the promise without the text.
            console.error('[tutor] commitment (with text) failed, retrying without inline_text:', error.message)
            const { error: retryErr } = await svc.from('coach_commitments').upsert(
              withText.map(component_id => ({ session_id: sessionId, component_id })),
              { onConflict: 'session_id,component_id', ignoreDuplicates: true },
            )
            if (retryErr) console.error('[tutor] commitment fallback failed:', retryErr.message)
          }
        }
        if (withoutText.length) {
          // ignoreDuplicates: a bare DONE must never blank text an earlier turn captured.
          const { error } = await svc.from('coach_commitments').upsert(
            withoutText.map(component_id => ({ session_id: sessionId, component_id })),
            { onConflict: 'session_id,component_id', ignoreDuplicates: true },
          )
          if (error) console.error('[tutor] commitment (bare) failed:', error.message)
        }
      }
    } catch (err) {
      console.error('[tutor] commitment record threw:', err?.message)    }
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
