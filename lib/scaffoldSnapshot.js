import { reconcileComponentsWrite } from './scaffoldGrowth.js'

// Durable scaffold persistence at completion.
//
// The scaffold row (paragraph_scaffolds) is the ONLY durable home for the final
// content of custom / non-prose forms (haiku, poem, list, letter, speech, story)
// and the onboarding hook — prose additionally assembles into `paragraphs`, but
// custom forms do not. During a live session the scaffold is written by the
// client's fire-and-forget POST/PATCH to /api/scaffold/[sessionId]; if any of
// those never land (a superseded turn, a network blip, a resumed session, or —
// historically — a rejected INSERT), the locked lines survive only in React state
// and are lost the moment the session is flipped to complete.
//
// To make completion self-sufficient, the client sends its final scaffold snapshot
// to the complete endpoint, which upserts it here BEFORE marking the session
// complete and before assembling. This guarantees the produced content is in
// durable storage regardless of whether the live PATCHes landed. Uses the caller's
// RLS-scoped client — the student owns the session, so RLS permits the write.
export async function upsertScaffoldSnapshot(supabase, sessionId, scaffold) {
  // Only persist a real snapshot — never blank out an existing DB row with an
  // empty/absent client scaffold.
  if (!scaffold || !Array.isArray(scaffold.components) || scaffold.components.length === 0) {
    return { skipped: true }
  }

  // The old premise — "the client scaffold is always a superset of whatever reached the
  // DB" — stopped being true when scaffolds became able to GROW (2026-08-16). A tab open
  // from before a growth holds a SHORTER array, and completing from that tab would
  // truncate the stored tree and FREEZE the loss into the watcher-facing record, since a
  // complete session can no longer be grown or edited. Sections are only ever appended,
  // so a shorter array means a stale sender: carry the stored tail across.
  let components = scaffold.components
  const { data: liveRow } = await supabase
    .from('paragraph_scaffolds').select('components').eq('session_id', sessionId).maybeSingle()
  const rec = reconcileComponentsWrite(components, liveRow?.components)
  if (rec.reason) {
    console.error(`[scaffold-shrink-guard] completion snapshot, session ${sessionId}: ${rec.reason}`)
    components = rec.components
  }

  const row = {
    session_id: sessionId,
    assignment_type: scaffold.assignment_type ?? null,
    total_paragraphs: Math.max(scaffold.total_paragraphs ?? 0, components.length),
    current_paragraph_index: scaffold.current_paragraph_index ?? 0,
    components,
    updated_at: new Date().toISOString(),
  }
  if (scaffold.thesis !== undefined) row.thesis = scaffold.thesis

  const { error } = await supabase
    .from('paragraph_scaffolds')
    .upsert(row, { onConflict: 'session_id' })

  if (error) {
    // Non-fatal: log and continue. A failed upsert must not block completion, but
    // it is exactly the signal we want if the constraint/schema drifts again.
    console.error('[complete scaffold-snapshot] upsert failed:', error.message)
    return { error: error.message }
  }
  return { ok: true }
}
