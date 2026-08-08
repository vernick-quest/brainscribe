import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { persistRequirementsActual } from '@/lib/requirements'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { checkProvenance } from '@/lib/provenance'

// Lever B provenance, Phase 1: SHADOW MODE — score the saved paragraph against
// the student's own words (its raw dictation + their role:'user' turns) and LOG
// below-threshold saves. Runs deferred (after()) so it adds zero latency to the
// student's save, and stores nothing from this route — the durable per-paragraph
// annotation happens at paragraph-complete time in the scaffold PATCH, the single
// writer of paragraph_scaffolds.components (avoids a cross-route write race that
// could clobber a lock). Hard-block is Phase 2, gated on full esl-drift-probes
// calibration.
async function shadowProvenanceCheck(supabase, { sessionId, position, scribedText, rawSpokenText, studentId, trigger = 'create' }) {
  try {
    let raw = rawSpokenText
    if (raw === undefined) {
      const { data } = await supabase
        .from('paragraphs').select('raw_spoken_text')
        .eq('session_id', sessionId).eq('position', position).single()
      raw = data?.raw_spoken_text
    }
    const { data: msgs } = await supabase
      .from('messages').select('content')
      .eq('session_id', sessionId).eq('role', 'user')
    const sources = [raw, ...(msgs ?? []).map(m => m.content)].filter(Boolean)
    const r = checkProvenance(scribedText, sources)

    if (!r.pass) {
      console.warn(
        `[provenance-shadow] session ${sessionId} paragraph ${position} save below threshold ` +
        `(novelFraction ${Math.round(r.novelFraction * 1000) / 1000}, ` +
        `novel: ${r.novelWords.slice(0, 8).join(' ')}) — WOULD flag; save persisted (shadow mode)`
      )
    }

    // Persist EVERY check (pass and fail), not just the warnings. A console line is
    // invisible and unqueryable, so there was no way to know how often this fires or
    // at what novelFraction — and therefore no way to pick a threshold. Recording the
    // passes too gives the baseline distribution the failures have to be separated
    // from. Still SHADOW: this never blocks a save.
    //
    // Service role: provenance_checks is deny-by-default (admin read only, migration
    // 051) — it holds a fragment of a child's writing, so it is not client-readable.
    await createServiceClient().from('provenance_checks').insert({
      session_id: sessionId,
      student_id: studentId ?? null,
      position,
      trigger,
      passed: r.pass,
      novel_fraction: Math.min(9.9999, Number(r.novelFraction ?? 0)),   // numeric(5,4)
      novel_words: (r.novelWords ?? []).slice(0, 8).join(' ') || null,
      content_count: r.contentCount ?? null,
    })
  } catch (e) {
    // Never let the signal break a student's save.
    console.error('[provenance-shadow] paragraph check failed:', e)
  }
}

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // A student writes at most a few paragraphs a minute — anything faster is a
  // script filling the DB. (Shared key with PATCH: it's one writing activity.)
  if (!await checkRateLimit(`paragraphs:${user.id}`, 30, 60)) return rateLimited()

  const { sessionId, scribedText, rawSpokenText, position, isThin } = await request.json()

  // ── Continuation backstop ("Keep working on this", v2) ──────────────────────────────
  // The upsert below is the right primitive for a normal session: a position is written
  // once, and re-saving it is a genuine redo. On a v2 continuation it is a data-loss
  // primitive. v2 carries v1's paragraphs AND v1's cursor, which v1 parks at
  // components.length — so successive dictations all compute the SAME position and each
  // one silently replaces the last (reproduced 2026-08-08: two saves, one row id, 204-ish
  // success both times, the first addition gone). An in-range position is no safer: it
  // holds carried text, and this route replaces the row rather than appending to it.
  //
  // The client already refuses to compute either (TutorSession resolveParagraphWriteIndex),
  // but a client-side guard is one regression away from silence and the failure mode here
  // returns 200 — indistinguishable from a save. So refuse here too, and say so LOUDLY.
  // Scoped to continuations: a session with no continued_from behaves exactly as before.
  const { data: sess } = await supabase
    .from('sessions').select('continued_from').eq('id', sessionId).single()
  if (sess?.continued_from) {
    const { data: occupied } = await supabase
      .from('paragraphs').select('id').eq('session_id', sessionId).eq('position', position).maybeSingle()
    if (occupied) {
      console.error(
        `[continuation-guard] REFUSED paragraph save: session ${sessionId} continues ${sess.continued_from} ` +
        `and position ${position} already holds row ${occupied.id}. Upserting would have replaced carried ` +
        `student writing. Nothing was written.`
      )
      return Response.json({
        error: "That paragraph already has your earlier writing in it — I'm not going to overwrite it.",
        code: 'continuation_would_overwrite',
      }, { status: 409 })
    }
  }

  // Upsert, not insert: paragraphs(session_id, position) is unique (migration 027),
  // so re-saving a position replaces the row instead of erroring or duplicating.
  const { data, error } = await supabase
    .from('paragraphs')
    .upsert({ session_id: sessionId, scribed_text: scribedText, raw_spoken_text: rawSpokenText, position, is_thin: isThin ?? false },
      { onConflict: 'session_id,position' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Keep sessions.requirements.actual fresh after each paragraph save — deferred
  // so it never adds latency to the student's save (no-op if no requirements set).
  after(() => persistRequirementsActual(supabase, sessionId))
  after(() => shadowProvenanceCheck(supabase, { sessionId, position, scribedText, rawSpokenText, studentId: user.id, trigger: 'create' }))

  return Response.json(data)
}

export async function PATCH(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await checkRateLimit(`paragraphs:${user.id}`, 30, 60)) return rateLimited()

  const { sessionId, position, scribedText } = await request.json()

  const { data, error } = await supabase
    .from('paragraphs')
    .update({ scribed_text: scribedText })
    .eq('session_id', sessionId)
    .eq('position', position)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  after(() => persistRequirementsActual(supabase, sessionId))
  // rawSpokenText undefined → the check fetches the stored raw dictation itself.
  after(() => shadowProvenanceCheck(supabase, { sessionId, position, scribedText, studentId: user.id, trigger: 'edit' }))

  return Response.json(data)
}
