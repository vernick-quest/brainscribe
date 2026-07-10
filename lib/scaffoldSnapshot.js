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
  // empty/absent client scaffold. The client scaffold at completion is
  // authoritative (it loads from the DB on resume, then reflects every live lock),
  // so it is always a superset of whatever reached the DB.
  if (!scaffold || !Array.isArray(scaffold.components) || scaffold.components.length === 0) {
    return { skipped: true }
  }

  const row = {
    session_id: sessionId,
    assignment_type: scaffold.assignment_type ?? null,
    total_paragraphs: scaffold.total_paragraphs ?? scaffold.components.length,
    current_paragraph_index: scaffold.current_paragraph_index ?? 0,
    components: scaffold.components,
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
