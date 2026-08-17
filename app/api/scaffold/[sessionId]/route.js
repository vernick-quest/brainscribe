import { createClient } from '@/lib/supabase/server'
import { checkProvenance } from '@/lib/provenance'
import { annotateScaffoldProvenance, needsProvenancePass } from '@/lib/scaffoldProvenance'
import { createServiceClient } from '@/lib/supabase/service'
import { after } from 'next/server'

// GET — fetch scaffold for a session
export async function GET(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params
  const { data } = await supabase
    .from('paragraph_scaffolds')
    .select('*')
    .eq('session_id', sessionId)
    .single()

  return Response.json(data ?? null)
}

// POST — create scaffold (called when coach emits [SCAFFOLD:type:count])
export async function POST(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params
  const { assignmentType, totalParagraphs, components } = await request.json()

  const { data, error } = await supabase
    .from('paragraph_scaffolds')
    .upsert({
      session_id: sessionId,
      assignment_type: assignmentType,
      total_paragraphs: totalParagraphs,
      current_paragraph_index: 0,
      components,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

// Persist every scaffold-lock provenance score, pass AND fail.
//
// The scaffold JSON keeps the latest record per lock, which is what the coach reads —
// but it is overwritten in place and carries no timestamp, so it cannot answer "what
// does the normal distribution look like, and is it drifting?". That question is the
// gate on Phase 2 (enforcement), and it was unanswerable: measured 2026-08-11, the
// scaffold JSON held 19 records while provenance_checks held ONE row, because only
// /api/paragraphs ever wrote to it.
//
// Recording the PASSES is the point. Failures alone cannot tell you where to put a
// threshold — you need the baseline they have to be separated from.
//
// Service role: provenance_checks is deny-by-default (admin read only, migration 051).
//
// Deferred via after(), NOT left as a bare un-awaited promise: on a serverless runtime
// the function can be reclaimed the moment the response is returned, so a floating
// insert may simply never run — which would reproduce the empty table this exists to
// fill, and reproduce it invisibly. after() keeps it off the student's critical path
// while still guaranteeing it executes. It writes a derived QA signal, never student
// work, so it must never delay or fail a lock.
async function recordProvenanceChecks({ sessionId, studentId, checked }) {
  if (!checked?.length) return
  try {
    const rows = checked.map(c => ({
      session_id: sessionId,
      student_id: studentId ?? null,
      position: c.paraIndex,
      kind: c.kind,
      item_id: c.itemId ?? null,
      trigger: 'lock',
      passed: c.provenance.pass,
      novel_fraction: Math.min(9.9999, Number(c.provenance.novelFraction ?? 0)),  // numeric(5,4)
      novel_words: (c.provenance.novelWords ?? []).slice(0, 8).join(' ') || null,
      content_count: c.provenance.contentCount ?? null,
    }))
    const { error } = await createServiceClient().from('provenance_checks').insert(rows)
    // .catch() would only ever see a network fault — a 4xx from PostgREST comes back
    // in `error` and reads as success. Check the value, not the absence of a throw.
    if (error) console.error(`[provenance-shadow] check insert failed (${error.code}): ${error.message}`)
  } catch (e) {
    console.error('[provenance-shadow] check insert threw:', e)
  }
}

// PATCH — update scaffold state (component status, thesis, paragraph progress)
export async function PATCH(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params
  const body = await request.json()

  // body can include: components, thesis, current_paragraph_index
  const update = { updated_at: new Date().toISOString() }
  if (body.components !== undefined)              update.components = body.components
  if (body.thesis !== undefined)                  update.thesis = body.thesis
  if (body.current_paragraph_index !== undefined) update.current_paragraph_index = body.current_paragraph_index

  // ── Lever B provenance, Phase 1: SHADOW MODE (never blocks a lock) ──────────
  // At the lock-persist point, score newly-locked entries against the student's
  // OWN words (their raw dictation + role:'user' turns) and annotate the result
  // into the components JSON (lib/scaffoldProvenance.js documents the contract).
  // Below-threshold locks are LOGGED, not blocked — hard-block is Phase 2, gated
  // on the full esl-drift-probes calibration. Wrapped so a provenance failure can
  // never break the student's lock: on any error we persist the client's
  // components exactly as before this existed.
  if (body.components !== undefined) {
    try {
      const { data: storedRow } = await supabase
        .from('paragraph_scaffolds')
        .select('components, thesis')
        .eq('session_id', sessionId)
        .single()
      const stored = storedRow?.components ?? []
      const thesisChanged = typeof body.thesis === 'string' && body.thesis.trim() !== '' &&
        body.thesis !== storedRow?.thesis

      if (needsProvenancePass(body.components, stored) || thesisChanged) {
        const [{ data: msgs }, { data: paras }, { data: sess }] = await Promise.all([
          supabase.from('messages').select('content')
            .eq('session_id', sessionId).eq('role', 'user'),
          supabase.from('paragraphs').select('position, scribed_text, raw_spoken_text')
            .eq('session_id', sessionId),
          // The session OWNER, not the acting user: under admin remote-in those differ,
          // and provenance_checks.student_id is what the COPPA cascade deletes on — a
          // fragment of a child's writing must not survive the child's account.
          supabase.from('sessions').select('student_id').eq('id', sessionId).single(),
        ])
        const studentSources = [
          ...(paras ?? []).map(p => p.raw_spoken_text),
          ...(msgs ?? []).map(m => m.content),
        ]
        const paragraphTexts = Object.fromEntries(
          (paras ?? []).map(p => [p.position, p.scribed_text])
        )
        const { components, checked, flagged, unscorable } = annotateScaffoldProvenance({
          incoming: body.components, stored, paragraphTexts, studentSources,
        })
        update.components = components
        for (const f of flagged) {
          console.warn(
            `[provenance-shadow] session ${sessionId} ${f.kind} para ${f.paraIndex}` +
            `${f.itemId ? ` item ${f.itemId}` : ''} below threshold ` +
            `(novelFraction ${f.provenance.novelFraction}) — WOULD flag; lock persisted (shadow mode)`
          )
        }
        // A lock we could not score is a HOLE in the signal, not a quiet pass. The
        // paragraph arm silently scored nothing for weeks and read as "nothing to
        // report" — that is exactly the shape this line exists to break.
        for (const u of unscorable) {
          console.warn(
            `[provenance-shadow] session ${sessionId} ${u.kind} para ${u.paraIndex}` +
            `${u.itemId ? ` item ${u.itemId}` : ''} NOT SCORED (${u.reason}) — ` +
            `lock persisted UNMONITORED; will retry on the next PATCH`
          )
        }
        // Persist EVERY check, pass and fail, to provenance_checks (migration 051 +
        // 064). The scaffold JSON already holds the latest record per lock, but it is
        // overwritten in place and carries no timestamp, so it cannot answer "what is
        // the distribution, and is it moving?" — the question Phase 2 is gated on.
        // Measured 2026-08-11: 19 records in scaffold JSON, ONE row in the table.
        after(() => recordProvenanceChecks({ sessionId, studentId: sess?.student_id ?? null, checked }))
        // Top-level [THESIS] has no storage slot without a migration (text column)
        // — log-only. The thesis usually ALSO locks as an item (covered above).
        if (thesisChanged) {
          const t = checkProvenance(body.thesis, studentSources)
          if (!t.pass) {
            console.warn(
              `[provenance-shadow] session ${sessionId} thesis below threshold ` +
              `(novelFraction ${Math.round(t.novelFraction * 1000) / 1000}) — WOULD flag; persisted (shadow mode, log-only)`
            )
          }
        }
      } else {
        // No new locks — still carry prior annotations forward, since the client
        // PATCHes the whole tree without the provenance keys the server added.
        const { components } = annotateScaffoldProvenance({
          incoming: body.components, stored, paragraphTexts: {}, studentSources: [],
        })
        update.components = components
      }
    } catch (e) {
      console.error('[provenance-shadow] annotation failed — persisting lock unmodified:', e)
      update.components = body.components
    }
  }

  // UPSERT, not update. `.update().single()` errors when no row exists, so a single failed
  // create POST at session start made EVERY subsequent PATCH 500 for the rest of the
  // session — and every caller ignores the response, so the student's whole scaffold lived
  // only in React state until the tab closed. Recreating the row is strictly better than
  // failing every write for the life of the session.
  // Shape columns, when the client sent them — only used by the insert branch of the
  // upsert (a row recreated after a failed create POST). On conflict they simply rewrite
  // the same values.
  if (body.assignmentType) update.assignment_type = body.assignmentType
  if (Number.isInteger(body.totalParagraphs)) update.total_paragraphs = body.totalParagraphs

  const { data, error } = await supabase
    .from('paragraph_scaffolds')
    .upsert({ session_id: sessionId, ...update }, { onConflict: 'session_id' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Mirror thesis to sessions table for easy access
  if (body.thesis) {
    await supabase
      .from('sessions')
      .update({ thesis_statement: body.thesis, thesis_confirmed: true })
      .eq('id', sessionId)
  }

  return Response.json(data)
}
