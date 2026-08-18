import { createClient } from '@/lib/supabase/server'
import { checkProvenance } from '@/lib/provenance'
import { annotateScaffoldProvenance, needsProvenancePass } from '@/lib/scaffoldProvenance'
import { reconcileComponentsWrite } from '@/lib/scaffoldGrowth'
import { STARTING_DRAFT_TABLE, STARTING_DRAFT_CONTENT_COLUMN, startingDraftSources, classifyStartingDraftRead, provenanceIsTrustworthy } from '@/lib/startingDraft'
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
        const [{ data: msgs }, { data: paras }, { data: sess }, startingRead] = await Promise.all([
          supabase.from('messages').select('content')
            .eq('session_id', sessionId).eq('role', 'user'),
          supabase.from('paragraphs').select('position, scribed_text, raw_spoken_text')
            .eq('session_id', sessionId),
          // The session OWNER, not the acting user: under admin remote-in those differ,
          // and provenance_checks.student_id is what the COPPA cascade deletes on — a
          // fragment of a child's writing must not survive the child's account.
          supabase.from('sessions').select('student_id').eq('id', sessionId).single(),
          // ── THE SEAM (SPEC-starting-draft.md) ────────────────────────────────────
          // A declared starting draft is a THIRD category of the student's own writing,
          // and it was in neither of the two arrays below. Without it, every lock drawn
          // from that draft scores novelFraction 1.00 and is written to provenance_checks
          // as passed=false — the student's own writing recorded as coach-authored, and
          // fabricated failures seeded into the dataset Phase 2 is calibrated from.
          //
          // maybeSingle, not single: no row is the COMMON path (most students arrive with
          // nothing) and .single() reports that as PGRST116, an error.
          //
          // 🔴 SERVICE client, unlike the reads above it. An RLS-filtered read returns
          // `200` with `data: null`, which is INDISTINGUISHABLE from "no starting draft" —
          // so a wrong SELECT policy from intake would silently drop the draft out of
          // studentSources and reinstate the exact blocker this seam exists to prevent,
          // with every check reporting green. Service role cannot be filtered by a policy,
          // so that failure mode does not exist here. Safe because the content never
          // leaves the server: it enters scoring and nothing else. The scaffold WRITE
          // below stays on the user-scoped client.
          createServiceClient().from(STARTING_DRAFT_TABLE).select(STARTING_DRAFT_CONTENT_COLUMN)
            .eq('session_id', sessionId).maybeSingle(),
        ])

        const startingState = classifyStartingDraftRead(startingRead?.error, startingRead?.data)
        if (startingState === 'no-table') {
          // focus/assignment-intake's migration is not applied yet, so NO session can have
          // a starting draft and scoring without one is exactly right. Expected, not a
          // fault — but said out loud, because the day it stops being true this line is
          // the only warning that the seam is open.
          console.log(`[starting-draft] ${STARTING_DRAFT_TABLE} not present — scoring without it (migration unapplied)`)
        } else if (startingState === 'unknown') {
          console.error(
            `[starting-draft] READ FAILED for session ${sessionId}: ` +
            `${startingRead?.error?.code ?? '?'} ${startingRead?.error?.message ?? ''}. ` +
            `Cannot tell whether this session has a starting draft, so any lock drawn from ` +
            `one would score as coach-authored. Locks still persist; the checks are NOT recorded.`
          )
        }

        const studentSources = [
          ...(paras ?? []).map(p => p.raw_spoken_text),
          ...(msgs ?? []).map(m => m.content),
          ...startingDraftSources(startingRead?.data),
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
        // ⚠️ Record only what we can TRUST. If the starting-draft read failed for an
        // unknown reason, a lock drawn from that draft scores 1.00 novel — and writing
        // that to provenance_checks turns a transient read failure into a permanent false
        // record in the calibration set. The lock itself is never blocked. A hole in the
        // signal is recoverable and is already logged as such above; a fabricated failure
        // is not. Same rule the unscorable branch applies, new cause.
        if (provenanceIsTrustworthy(startingState)) {
          after(() => recordProvenanceChecks({ sessionId, studentId: sess?.student_id ?? null, checked }))
        } else {
          console.warn(
            `[provenance-shadow] session ${sessionId} — ${checked.length} check(s) NOT RECORDED: ` +
            `the starting draft could not be read, so their scores are untrustworthy`
          )
        }
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

  // ── Stale-shrink guard (scaffold growth, 2026-08-16) ────────────────────────────────
  // This route writes the client's WHOLE components array. That was safe while the
  // structure was fixed for the life of the session; it is not safe now that a scaffold
  // can GROW. A tab open from before a growth holds a shorter array, and its next lock
  // would truncate the stored one — deleting the grown section and any work inside it.
  // Sections are only ever appended, so a shorter incoming array means a stale sender:
  // carry the stored tail across instead of losing it, and log loudly. Runs LAST so it
  // also covers whatever the provenance pass above produced.
  if (update.components !== undefined) {
    const { data: liveRow } = await supabase
      .from('paragraph_scaffolds').select('components').eq('session_id', sessionId).maybeSingle()
    const rec = reconcileComponentsWrite(update.components, liveRow?.components)
    if (rec.reason) {
      console.error(`[scaffold-shrink-guard] session ${sessionId}: ${rec.reason}`)
      update.components = rec.components
      // total_paragraphs must not describe a shorter tree than we are storing.
      if (Number.isInteger(update.total_paragraphs) && update.total_paragraphs < rec.components.length) {
        update.total_paragraphs = rec.components.length
      }
    }
  }

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
