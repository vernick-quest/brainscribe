// app/api/sessions/[id]/continue/route.js — "Keep working on this".
//
// Mints a v2 session that carries v1's scaffold + final draft + sources + requirements
// and links back to v1 (continued_from). v1 stays frozen: it's the watcher-facing record
// AND the draft-integrity baseline, so we never reopen it in place. See
// docs/specs/brainscribe-keep-working-spec.md.
//
// The copy is a bulk row duplication (NOT a token-driven scaffold write), so it bypasses
// the [DONE:]/[NUGGET:] path that dropped student work three+ times. But the discipline
// from that history applies: write, then READ BACK and assert the copy landed; on any
// failure, tear down the half-built v2 and fail LOUD rather than hand back a partial one.

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { COACH_GATE_COLUMNS, coachGateFailure } from '@/lib/access'
import { getImpersonation } from '@/lib/impersonation'
import {
  buildContinuationSession,
  buildContinuationScaffold,
  buildContinuationParagraphs,
  buildContinuationSources,
  CONTINUATION_ENABLED,
} from '@/lib/sessionContinuation'

export async function POST(request, { params }) {
  const { id } = await params

  // Kill switch (lib/sessionContinuation.js) — off while the v2 cursor drop path is
  // unresolved. Guarded HERE as well as on the button, because hiding a CTA is not a
  // control: this endpoint is a plain POST any signed-in owner could still call.
  if (!CONTINUATION_ENABLED) {
    return Response.json(
      { error: "Keep working is switched off for a moment while we fix something. Your finished draft is safe — nothing has changed.", code: 'continuation_disabled' },
      { status: 503 }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Creating a session is a write "as the user" — blocked while an admin is remoted in
  // (same backstop as /api/sessions POST).
  const { data: actor } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (await getImpersonation(actor)) {
    return Response.json({ error: "Exit remote-in to keep working — admins can't start work as a user." }, { status: 403 })
  }

  // Same daily cap + coach-reachability gate (COPPA + Beta access) as any session
  // creation — "keep working" mints a real session and must not be a gate bypass.
  if (!await checkRateLimit(`sessions:day:${user.id}`, 30, 86400)) {
    return rateLimited("You've started a lot of sessions today — please try again tomorrow.")
  }
  const { data: gate } = await supabase
    .from('profiles').select(COACH_GATE_COLUMNS).eq('id', user.id).single()
  const gateFail = coachGateFailure(gate)
  if (gateFail) return gateFail

  // v1 must be the caller's OWN finished, non-practice assignment.
  const { data: v1 } = await supabase
    .from('sessions').select('*').eq('id', id).single()
  if (!v1 || v1.student_id !== user.id) return Response.json({ error: 'Not found.' }, { status: 404 })
  if (v1.is_onboarding) return Response.json({ error: 'Practice sessions cannot be continued.' }, { status: 400 })
  if (v1.gym_session_id) return Response.json({ error: 'Skill Studio practice cannot be continued as an assignment.' }, { status: 400 })
  if (v1.status !== 'complete') return Response.json({ error: 'Only a finished assignment can be continued.' }, { status: 400 })

  // Double-tap guard: if this v1 already spawned a child, route to it instead of minting
  // another v2 (avoids v2/v3/v4 sprawl from repeated taps). Ordered so the newest wins.
  const { data: existingChild } = await supabase
    .from('sessions').select('id').eq('continued_from', id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (existingChild?.id) return Response.json({ newSessionId: existingChild.id, reused: true })

  // Read v1's carried-forward content (owner RLS permits all of these). CRITICAL: check
  // every read's error. A swallowed read error would hand us [] / no-scaffold, we'd mint
  // an EMPTY v2, and the read-back verify would PASS (it would compare v2 against the same
  // corrupted source — 0===0). The verify's baseline must be independently trusted, so a
  // failed source read aborts here, BEFORE any v2 exists (CLAUDE.md silent-no-op class).
  const [scaffoldRes, paraRes, sourceRes] = await Promise.all([
    supabase.from('paragraph_scaffolds').select('*').eq('session_id', id).maybeSingle(),
    supabase.from('paragraphs').select('*').eq('session_id', id).order('position'),
    supabase.from('sources').select('*').eq('session_id', id).order('position'),
  ])
  if (scaffoldRes.error || paraRes.error || sourceRes.error) {
    console.error('[continue] v1 read failed — refusing to copy from an untrusted baseline:',
      scaffoldRes.error?.message, paraRes.error?.message, sourceRes.error?.message)
    return Response.json({ error: 'Could not read your finished draft — nothing was changed.' }, { status: 503 })
  }
  const v1Scaffold = scaffoldRes.data
  const srcParagraphs = paraRes.data ?? []
  const srcSources = sourceRes.data ?? []

  // 1) Mint the v2 session (requires migration 057 — continued_from/version columns).
  // last_active_at is seeded NOW (dropped from the copy, re-set here) so the new draft
  // sorts to the TOP of the folder — otherwise it lands last / off the limit(50) window.
  const { data: v2, error: sErr } = await supabase
    .from('sessions')
    .insert({ ...buildContinuationSession(v1, srcParagraphs, v1Scaffold?.components ?? []), last_active_at: new Date().toISOString() })
    .select()
    .single()
  if (sErr || !v2) {
    // Lost a double-tap race: the unique index on continued_from (migration 057) rejected
    // this second insert because the first tap already created the child. Return the winner.
    if (sErr?.code === '23505') {
      const { data: winner } = await supabase
        .from('sessions').select('id').eq('continued_from', id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (winner?.id) return Response.json({ newSessionId: winner.id, reused: true })
    }
    console.error('[continue] v2 session insert failed:', sErr?.message)
    return Response.json({ error: 'Could not start a new draft.' }, { status: 500 })
  }

  // Tear down the half-built v2 (cascade removes any child rows) and fail loud. Better a
  // clean error than a v2 the student opens missing half their carried work.
  async function abort(where, detail) {
    console.error(`[continue] ${where} failed for v2 ${v2.id}: ${detail} — rolling back the v2 session`)
    const { error: delErr } = await supabase.from('sessions').delete().eq('id', v2.id)
    if (delErr) {
      // The rollback itself failed — an active, half-built v2 is now in the student's
      // folder. Say so loudly; do NOT tell them "nothing was changed" (it's false).
      console.error(`[continue] ROLLBACK FAILED for v2 ${v2.id}: ${delErr.message} — orphaned half-built session left behind`)
      return Response.json({ error: 'Something went wrong carrying your work forward. Your finished draft is safe; please check your folder.' }, { status: 500 })
    }
    return Response.json({ error: 'Could not carry your work forward — nothing was changed.' }, { status: 500 })
  }

  // 2) Copy scaffold, paragraphs, sources under the new session id.
  const scaffoldRow = buildContinuationScaffold(v1Scaffold, v2.id)
  if (scaffoldRow) {
    const { error } = await supabase.from('paragraph_scaffolds').insert(scaffoldRow)
    if (error) return abort('scaffold copy', error.message)
  }
  const paraRows = buildContinuationParagraphs(srcParagraphs, v2.id)
  if (paraRows.length) {
    const { error } = await supabase.from('paragraphs').insert(paraRows)
    if (error) return abort('paragraphs copy', error.message)
  }
  const sourceRows = buildContinuationSources(srcSources, v2.id)
  if (sourceRows.length) {
    const { error } = await supabase.from('sources').insert(sourceRows)
    if (error) return abort('sources copy', error.message)
  }

  // 3) READ BACK and assert the copy landed (plant→write→verify, per CLAUDE.md). Counts
  // must match; the final-draft text must be byte-identical to v1's. A silent short-copy
  // here would hand the student a v2 missing work — the exact class of bug we refuse to ship.
  const [{ data: chkParas }, { count: chkSourceCount }, { data: chkScaffold }] = await Promise.all([
    supabase.from('paragraphs').select('scribed_text, position').eq('session_id', v2.id).order('position'),
    supabase.from('sources').select('id', { count: 'exact', head: true }).eq('session_id', v2.id),
    supabase.from('paragraph_scaffolds').select('components').eq('session_id', v2.id).maybeSingle(),
  ])
  const v1Text = srcParagraphs.map(p => p.scribed_text).join('\n\n')
  const v2Text = (chkParas ?? []).map(p => p.scribed_text).join('\n\n')
  const scaffoldOk = !scaffoldRow || (chkScaffold?.components?.length === (v1Scaffold.components?.length ?? 0))
  if ((chkParas?.length ?? 0) !== paraRows.length || (chkSourceCount ?? 0) !== sourceRows.length ||
      v1Text !== v2Text || !scaffoldOk) {
    return abort('read-back verify',
      `paras ${chkParas?.length}/${paraRows.length}, sources ${chkSourceCount}/${sourceRows.length}, textMatch ${v1Text === v2Text}, scaffoldOk ${scaffoldOk}`)
  }

  return Response.json({ newSessionId: v2.id })
}
