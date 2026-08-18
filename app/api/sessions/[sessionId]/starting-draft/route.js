import { createClient } from '@/lib/supabase/server'
import { getImpersonation } from '@/lib/impersonation'
import { validateStartingDraft, hasConfirmedWork } from '@/lib/startingDraft'

// POST /api/sessions/[sessionId]/starting-draft
//
// Captures what the student arrived with, once, at session creation. The row is immutable
// by construction (migration 071: insert + select only, session_id is the PK, no update or
// delete grant for `authenticated`) — so there is deliberately no PATCH or DELETE here.
// There is no "edit your starting draft" because a revision has no wire representation.
//
// Body: { content: string, source?: 'typed' | 'pasted' | 'upload' }
export async function POST(request, { params }) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Admin remote-in is view + link only. Writing a starting draft is a data-writing act as
  // the student — and worse, an unrepeatable one, since the row can never be corrected.
  // Same posture as POST /api/sessions.
  const { data: actor } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (await getImpersonation(actor)) {
    return Response.json({ error: "Exit remote-in to add a starting draft — admins can't write as a user." }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const valid = validateStartingDraft(body)
  if (!valid.ok) return Response.json({ error: valid.error }, { status: 400 })

  // Ownership. RLS enforces this too (the insert policy re-checks student_id = auth.uid()),
  // but checking here turns a policy denial into a clear message instead of a raw 42501.
  const { data: session, error: sessionErr } = await supabase
    .from('sessions').select('id, student_id').eq('id', sessionId).maybeSingle()
  if (sessionErr) {
    console.error('[starting-draft POST] session read failed:', sessionErr.message)
    return Response.json({ error: 'Could not save your draft. Please try again.' }, { status: 500 })
  }
  if (!session || session.student_id !== user.id) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // v1: refuse once confirmed work exists. Past that point this is not a baseline, it is a
  // mid-stream paste (see SPEC-starting-draft.md) — refused with a clear message rather
  // than accepted into the wrong frame.
  //
  // ⚠️ A read ERROR here must NOT be treated as "no confirmed work". PostgREST returns
  // 200 [] for an RLS-filtered read, so absence and denial look identical; failing open
  // would let a mid-stream paste through on exactly the sessions we cannot see into.
  const [{ data: scaffold, error: scaffoldErr }, { count: paragraphCount, error: paraErr }] = await Promise.all([
    supabase.from('paragraph_scaffolds').select('components').eq('session_id', sessionId).maybeSingle(),
    supabase.from('paragraphs').select('id', { count: 'exact', head: true }).eq('session_id', sessionId),
  ])
  if (scaffoldErr || paraErr) {
    console.error('[starting-draft POST] confirmed-work check failed:',
      scaffoldErr?.message ?? paraErr?.message)
    return Response.json({ error: 'Could not save your draft. Please try again.' }, { status: 500 })
  }
  if (hasConfirmedWork(scaffold?.components ?? [], paragraphCount ?? 0)) {
    return Response.json({
      error: "You've already locked in work on this assignment, so this can't be saved as your starting point. Paste it to your coach in the chat instead.",
      code: 'work_already_started',
    }, { status: 409 })
  }

  // The write. `.select().single()` so we read the row BACK rather than trusting a status
  // code — a 204 on a zero-row write reports success, which is the shape of every silent
  // loss in this repo.
  const { data: row, error } = await supabase
    .from('session_starting_drafts')
    .insert({
      session_id: sessionId,
      content: valid.content,
      word_count: valid.wordCount,
      source: valid.source,
    })
    .select('session_id, word_count, created_at')
    .single()

  if (error) {
    // 23505 = the PK already has a row. That is the immutability guard doing its job, not
    // a transient fault: never retried, never overwritten, and reported as its own thing.
    if (error.code === '23505') {
      return Response.json({
        error: 'A starting draft is already saved for this assignment. It cannot be replaced.',
        code: 'already_captured',
      }, { status: 409 })
    }
    console.error('[starting-draft POST] insert failed:', error.code, error.message)
    return Response.json({ error: 'Could not save your draft. Please try again.' }, { status: 500 })
  }

  return Response.json({ ok: true, wordCount: row.word_count, createdAt: row.created_at })
}
