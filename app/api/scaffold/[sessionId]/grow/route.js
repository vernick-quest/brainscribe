// app/api/scaffold/[sessionId]/grow/route.js — add empty sections to a LIVE scaffold.
//
// ── Why this endpoint exists (Sierra, 2026-08-16) ────────────────────────────────────
// `[SCAFFOLD:type:count]` fires once and the structure is fixed for the life of the
// session. A ten-scene story scaffolded as ONE section therefore had to hold every scene
// in a single container, until that container's assembly payload hit the model ceiling.
// She had ~1,200 confirmed words and nowhere to put scene three.
//
// "Keep working" (v2) grows on COPY, which fixes the NEXT session. It cannot reach a
// student who is stuck in a live one: /api/sessions/[id]/continue requires
// status='complete', and finishing an in-progress draft first would carry an empty draft
// forward. So growth has to be available IN PLACE, on an active session.
//
// ── Why growth is its own endpoint instead of a longer components array ──────────────
// The scaffold PATCH accepts a whole components array from the client. That is the right
// primitive for locking a component, and the WRONG one for growth: a longer array can
// also silently drop or rewrite an existing section, and this write path has six separate
// historical drop paths behind it (see lib/scaffoldWrite.js). Here the client sends only
// a COUNT. The server appends to what is STORED, via a pure append-only function. There
// is no wire format in which a caller can hand us an altered section — the loss case is
// unrepresentable rather than merely guarded. Then we read back and prove it anyway.

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { growComponents, verifyGrowth, MAX_GROWTH } from '@/lib/scaffoldGrowth'

export async function POST(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await params
  if (!await checkRateLimit(`scaffold-grow:${user.id}`, 20, 60)) return rateLimited()

  const body = await request.json().catch(() => ({}))
  const addCount = body?.addCount
  const labels = Array.isArray(body?.labels) ? body.labels.slice(0, MAX_GROWTH).map(String) : undefined

  // Ownership: only the student who owns the session may reshape it. A watcher can read
  // this session under RLS, so ownership is checked explicitly rather than relying on the
  // update silently matching zero rows (which PostgREST reports as success).
  const { data: sess, error: sessErr } = await supabase
    .from('sessions').select('id, student_id, status').eq('id', sessionId).single()
  if (sessErr || !sess || sess.student_id !== user.id) {
    return Response.json({ error: 'Not found.' }, { status: 404 })
  }
  if (sess.status === 'complete') {
    // A finished session is the watcher-facing record and the integrity baseline. Growing
    // it in place would reshape a finished draft; "Keep working" mints a v2 for that.
    return Response.json({
      error: 'This assignment is finished — use "Keep working on this" to carry it into a new draft.',
      code: 'session_complete',
    }, { status: 409 })
  }

  // Read the STORED scaffold. Its error is checked: a swallowed read would let us append
  // to `[]` and write a scaffold that has lost every existing section.
  const { data: row, error: readErr } = await supabase
    .from('paragraph_scaffolds').select('components, updated_at').eq('session_id', sessionId).maybeSingle()
  if (readErr) {
    console.error(`[scaffold-grow] READ FAILED for session ${sessionId}: ${readErr.message} — refusing to grow from an untrusted baseline`)
    return Response.json({ error: 'Could not read your draft — nothing was changed.' }, { status: 503 })
  }
  const stored = row?.components
  if (!Array.isArray(stored) || stored.length === 0) {
    return Response.json({ error: 'This draft has no structure to add to yet.', code: 'no_scaffold' }, { status: 409 })
  }

  let grown
  try {
    grown = growComponents(stored, addCount, { labels, now: new Date().toISOString() })
  } catch (e) {
    return Response.json({ error: e.message, code: 'bad_growth_request' }, { status: 400 })
  }

  // Prove the property BEFORE writing, on the value we are about to send.
  const pre = verifyGrowth(stored, grown.components, grown.added)
  if (!pre.ok) {
    console.error(`[scaffold-grow] REFUSED for session ${sessionId}: ${pre.reason} — nothing written`)
    return Response.json({ error: 'Could not add sections safely — nothing was changed.' }, { status: 500 })
  }

  // COMPARE-AND-SWAP on updated_at. This is a read-modify-write of the whole array, so a
  // lock PATCH landing between our read and our write would be REVERTED by us — and the
  // read-back below would still pass, because it compares against our own stale baseline.
  // Matching on the updated_at we read makes a concurrent write cause zero rows to match,
  // which we detect and refuse. `.select()` is required: without a returned row we could
  // not tell a no-match from a success (PostgREST reports both as 2xx).
  const { data: written, error: writeErr } = await supabase
    .from('paragraph_scaffolds')
    .update({
      components: grown.components,
      total_paragraphs: grown.components.length,   // else the prompt/UI keep describing the OLD size
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)
    .eq('updated_at', row.updated_at)
    .select('session_id')
  if (writeErr) {
    console.error(`[scaffold-grow] WRITE FAILED for session ${sessionId}: ${writeErr.message}`)
    return Response.json({ error: 'Could not add sections — nothing was changed.' }, { status: 500 })
  }
  if (!written || written.length === 0) {
    console.warn(`[scaffold-grow] CONFLICT for session ${sessionId}: the draft changed while adding a section — nothing written`)
    return Response.json({
      error: 'Your draft changed while we were adding a section — nothing was changed. Try again.',
      code: 'concurrent_write',
    }, { status: 409 })
  }

  // Read back and prove it AGAIN against what actually landed. An UPDATE that matched
  // zero rows reports success, and the whole point of this endpoint is that the student's
  // existing sections came through untouched — so assert on the VALUES, not the status.
  const { data: after, error: afterErr } = await supabase
    .from('paragraph_scaffolds').select('components').eq('session_id', sessionId).maybeSingle()
  if (afterErr || !after) {
    console.error(`[scaffold-grow] READ-BACK FAILED for session ${sessionId}: ${afterErr?.message ?? 'no row'}`)
    return Response.json({ error: 'Added sections, but could not confirm — please reload before writing more.' }, { status: 500 })
  }
  const post = verifyGrowth(stored, after.components, grown.added)
  if (!post.ok) {
    console.error(
      `[scaffold-grow] READ-BACK MISMATCH for session ${sessionId}: ${post.reason}. ` +
      `The stored scaffold is NOT what we intended to write — treat as a data-integrity event.`
    )
    return Response.json({ error: 'Something went wrong adding sections — please reload and check your draft.' }, { status: 500 })
  }

  console.log(`[scaffold-grow] session ${sessionId}: ${stored.length} → ${after.components.length} sections (+${grown.added}), existing sections verified unchanged`)
  return Response.json({ ok: true, sections: after.components.length, added: grown.added, components: after.components })
}
