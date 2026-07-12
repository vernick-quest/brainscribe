import { createClient } from '@/lib/supabase/server'
import { checkProvenance } from '@/lib/provenance'
import { annotateScaffoldProvenance, hasNewLocks } from '@/lib/scaffoldProvenance'

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

      if (hasNewLocks(body.components, stored) || thesisChanged) {
        const [{ data: msgs }, { data: paras }] = await Promise.all([
          supabase.from('messages').select('content')
            .eq('session_id', sessionId).eq('role', 'user'),
          supabase.from('paragraphs').select('position, scribed_text, raw_spoken_text')
            .eq('session_id', sessionId),
        ])
        const studentSources = [
          ...(paras ?? []).map(p => p.raw_spoken_text),
          ...(msgs ?? []).map(m => m.content),
        ]
        const paragraphTexts = Object.fromEntries(
          (paras ?? []).map(p => [p.position, p.scribed_text])
        )
        const { components, flagged } = annotateScaffoldProvenance({
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

  const { data, error } = await supabase
    .from('paragraph_scaffolds')
    .update(update)
    .eq('session_id', sessionId)
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
