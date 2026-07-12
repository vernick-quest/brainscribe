import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
async function shadowProvenanceCheck(supabase, { sessionId, position, scribedText, rawSpokenText }) {
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
  } catch (e) {
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
  after(() => shadowProvenanceCheck(supabase, { sessionId, position, scribedText, rawSpokenText }))

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
  after(() => shadowProvenanceCheck(supabase, { sessionId, position, scribedText }))

  return Response.json(data)
}
