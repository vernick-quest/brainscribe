import Anthropic from '@anthropic-ai/sdk'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildCoachSystemBlocks } from '@/lib/prompts'
import { sessionCoachContribution } from '@/lib/scaffoldProvenance'
import { recordAnthropicUsage } from '@/lib/usage'
import { COACH_MODEL, requestOptionsFor, coachMaxTokens } from '@/lib/models'
import { createCoachStreamReader, coachTurnAbandoned } from '@/lib/coachStream'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { COACH_GATE_COLUMNS, coachGateFailure } from '@/lib/access'
import { parseCommitments, detectLockOverClaim } from '@/lib/coachCommitments'
import { hasLandedLockToken, stripCoachTokens } from '@/lib/coachTokens'
import { fetchStartingDraft } from '@/lib/startingDraft'
import { computeActualLive } from '@/lib/requirements'

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

  // ── What the student has ACTUALLY written, read fresh every turn ─────────────────
  // Two reads, in parallel, both with the SERVICE client. Access is already settled
  // above: a non-admin only reaches this line if RLS returned their session row, and an
  // admin is trusted. The service client matters because an RLS-filtered read returns
  // 200 with null/[] — indistinguishable from "no draft" / "no paragraphs" (the trap
  // documented in lib/startingDraft.js), and both of those answers flatter the student.
  //
  // 1. The starting draft (migration 071). Until 2026-10-11 the coach never saw it, so a
  //    student who declared 361 words had to paste them all into the chat. Classified
  //    present / absent / no-table / unknown; `unknown` reaches the prompt as its own
  //    state, so the coach never claims there is no draft on a read it could not make.
  // 2. The live word count. sessions.requirements.actual is refreshed only on paragraph
  //    save and on completion — never on a component confirm — so it sat stale for whole
  //    sessions and the coach estimated instead (said ~220 of a 177-word draft, then let
  //    it finish under a 350 minimum). Count it here, per turn. Deliberately NOT another
  //    write site: nothing is persisted.
  //    computeActualLive, NOT computeActualFromDraft: the latter counts paragraphs rows
  //    ALONE once any row exists, and rows only appear when a student taps "Assemble" — so
  //    one assembled section hid every other confirmed section. Harmless-ish on a chip;
  //    once this count GATES completion (Rule 12) that undercount is the coach telling a
  //    student who met the minimum that they're short. computeActualLive mirrors what
  //    /api/sessions/[id]/complete will actually put in the final Draft.
  //    `scaffold` is the client's live tree (scaffoldRef) — the same one the chip reads.
  const reqs = sessionRow?.requirements
  const hasTargets = Array.isArray(reqs?.targets) && reqs.targets.length > 0
  const svc = createServiceClient()
  const [startingDraftRead, parasRead] = await Promise.all([
    fetchStartingDraft(svc, sessionId).catch(err => {
      console.error(`[tutor] starting-draft read threw for session ${sessionId}:`, err?.message)
      return { draft: null, state: 'unknown' }
    }),
    hasTargets
      ? svc.from('paragraphs').select('scribed_text, position, paragraph_index').eq('session_id', sessionId)
          .then(r => r, err => ({ data: null, error: err }))
      : Promise.resolve({ data: null, error: null }),
  ])
  let liveRequirements = reqs
  let wordCountUnavailable = false
  if (hasTargets) {
    if (parasRead.error) {
      // Never fall back to the stored count: it is the stale number this exists to replace.
      // The prompt tells the coach the count is unknown instead.
      console.error(`[tutor] live word count FAILED for session ${sessionId}: ${parasRead.error?.code ?? ''} ${parasRead.error?.message ?? ''} — coach told the count is unknown this turn`)
      wordCountUnavailable = true
      liveRequirements = { ...reqs, actual: null }
    } else {
      liveRequirements = { ...reqs, actual: computeActualLive(parasRead.data ?? [], scaffold?.components) }
    }
  }
  const sd = startingDraftRead?.draft
  const startingDraft = startingDraftRead?.state === 'present' && sd
    ? { state: 'present', content: sd.content, wordCount: sd.word_count, source: sd.source }
    : { state: startingDraftRead?.state ?? 'unknown' }

  const { staticPrefix, dynamicTail } = buildCoachSystemBlocks(persona, effectiveAssignment, scaffold, {
    onboarding: isOnboarding,
    requirements: liveRequirements,
    wordCountUnavailable,
    startingDraft,
    resume: resume === true,
    continuation: isContinuation,
  })

  const stream = await anthropic.messages.stream({
    model: COACH_MODEL,
    // Per-model request fields (lib/models.js). On Opus 5.5: output_config.effort 'low' —
    // thinking can't be disabled there, and the default (medium) is ~15s of dead air before
    // the first spoken word. No temperature/top_p (400s on that model).
    ...requestOptionsFor(COACH_MODEL),
    // History (Sonnet 4.6): 4000, raised from 1000 on 2026-08-16 after it cut a real student's work.
    //
    // A [DONE:id:…] payload carries the student's EXACT words, so the ceiling is not
    // "how much should the coach say" — it is "how long can a section of their writing
    // be". Sierra wrote a ~700-word scene: ~950 tokens of payload before the coach said
    // anything. The turn cut mid-payload, the token never closed, and the client's
    // tokenRE (which requires the closing bracket) parsed ZERO locks. The lock failed
    // silently, twice, and ~30k characters of her story never reached `paragraphs`.
    //
    // Billed on ACTUAL output, so an ordinary turn costs exactly what it did before;
    // this only buys headroom for the turns that need it. 4000 covers roughly 2,500
    // words of payload. Beyond that the scaffold is the wrong shape, which is what the
    // scene-scaffolding rule now prevents at turn 1.
    //
    // This is a ceiling, not a fix. A long enough section exceeds any number — the real
    // repair is not putting the whole paragraph in a token payload.
    //
    // Opus 5.5: 8000 — its tokenizer needs ~1.25× the tokens for the same words, and its
    // (un-disableable) thinking spends from the same ceiling before any text. The sizing is
    // in lib/models.js COACH_MAX_TOKENS; it holds at least as many of the student's words
    // as 4000 did on Sonnet 4.6.
    max_tokens: coachMaxTokens(COACH_MODEL),
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
  // Token stripping lives in lib/coachTokens.js — see the note there on the fourth copy.

  // The stream's text tokens are enqueued to the client as they arrive, then the
  // stream closes immediately. The usage log + message insert run in after(), so the
  // client's read loop is no longer held open waiting on two DB round trips. after()
  // keeps the serverless function alive until those writes complete.
  let resolveResult
  const resultReady = new Promise(resolve => { resolveResult = resolve })
  // Set by cancel() below: the client went away before the turn was fully sent.
  let clientCancelled = false

  const readable = new ReadableStream({
    async start(controller) {
      // lib/coachStream.js: forwards ONLY text_delta — Opus 5.5 streams a thinking block
      // (thinking_delta + signature_delta) before every reply, and none of it may reach the
      // client's token parser or the speech queue. It also counts usage, cache tokens
      // included, and captures stop_reason ('max_tokens' = cut off; 'refusal' = declined).
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
        const savedText = stripCoachTokens(fullText)
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
        // A lock only counts if it CLOSED — an opening bracket is what a cut turn leaves
        // behind, so matching it made no_lock read 0 on the dropped-lock case. See
        // lib/coachTokens.js.
        const hadLockToken = hasLandedLockToken(fullText)
        resolveResult({
          usage: { inputTokens: st.inputTokens, outputTokens: st.outputTokens, cacheWriteTokens: st.cacheWriteTokens, cacheReadTokens: st.cacheReadTokens },
          savedText, rawText: fullText, truncated, hadLockToken, stopReason,
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
    const { usage, savedText, rawText, truncated, hadLockToken, stopReason } = await resultReady
    await recordAnthropicUsage({ model: COACH_MODEL, ...usage, sessionId, userId: user.id })

    // A safety-classifier decline is a 200 with stop_reason 'refusal' (Opus 5.5 runs
    // classifiers). The stream simply ends — possibly mid-sentence, possibly before a
    // closing [DONE:]/[CARE] — and nothing else marks it. On a child-safety product the
    // turn most likely to trip one is a student disclosing something, the turn that most
    // needs an answer, so it is LOUD, never a quietly short reply.
    if (stopReason === 'refusal') {
      console.error(
        `[tutor] 🔴 MODEL REFUSAL (stop_reason=refusal) session=${sessionId} model=${COACH_MODEL} ` +
        `chars_streamed=${rawText.length} lock_token_present=${hadLockToken} — the coach turn ended without a full reply`
      )
    }

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

    // ── An ABANDONED turn writes nothing but its usage (above) ──────────────────────────
    // The client aborts a stalled turn and applies NOTHING from it, so neither do we: no
    // partial coach message (it would reappear on reload), no coach_commitments row (the
    // integrity detector would flag a promise that was never applied), and no over-claim
    // record (control tokens come LAST, so a cut turn's "I've saved that" always looks
    // like an over-claim). No [CARE] is recorded server-side — it is stripped above and
    // rendered client-side only — so there is nothing to keep. See coachTurnAbandoned.
    const abandoned = coachTurnAbandoned({ streamCancelled: clientCancelled, signalAborted: request.signal?.aborted === true, stopReason })
    if (abandoned) {
      const { components } = parseCommitments(rawText)
      console.warn(
        `[tutor] client ABORTED the turn mid-stream session=${sessionId} chars_streamed=${rawText.length} ` +
        `stream_cancelled=${clientCancelled} — not persisting the partial coach message or its ${components.length} [DONE:] commitment(s)`
      )
      return
    }

    // Did the coach tell the student more was saved than it actually saved? Rule 25 holds
    // this at 0/4 in the prompt harness, but that is a behavioural rate re-measured on
    // every prompt change, not a guarantee — so check it deterministically here. The turn
    // has already streamed, so this never blocks; it makes a silent loss LOUD and
    // countable. Same service-client reasoning as the truncation counter: the signal must
    // not be forgeable by a signed-in user against an arbitrary session.
    try {
      const overClaim = detectLockOverClaim(rawText)
      if (overClaim.overClaimed) {
        console.error(
          `[tutor] LOCK OVER-CLAIM session=${sessionId} — the coach claimed ${overClaim.claimedAtLeast} ` +
          `section(s) were locked but emitted ${overClaim.emitted} lock token(s). The unclaimed ` +
          `section was NOT saved and the student has been told it was. Sentence: "${overClaim.sentence}"`
        )
        const { error: ocErr } = await createServiceClient().rpc('record_lock_over_claim', {
          p_session_id: sessionId,
          p_claimed: overClaim.claimedAtLeast,
          p_emitted: overClaim.emitted,
        })
        // Migration 070 is applied BY HAND, so this deploy can land before the function
        // exists. The console.error above is the part that must never depend on the DB.
        if (ocErr) console.error('[tutor] over-claim record failed:', ocErr.message)
      }
    } catch (err) {
      console.error('[tutor] over-claim check threw (non-fatal):', err?.message)
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
