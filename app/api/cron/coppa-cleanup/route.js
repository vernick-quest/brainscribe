import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

// GET /api/cron/coppa-cleanup — deletes under-13 accounts whose parental consent
// was never given within the 7-day window (the deletion the consent email/Privacy/
// Terms promise). Run daily by Vercel Cron (see vercel.json).
//
// Protected by CRON_SECRET: Vercel automatically sends `Authorization: Bearer
// <CRON_SECRET>` on cron invocations when that env var is set. Fails closed — if
// CRON_SECRET isn't configured, the route refuses to run (so it can never run
// unprotected). To run/test manually:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://www.brainscribe.io/api/cron/coppa-cleanup
export async function GET(request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()

  // Pending consent requests past their expiry.
  const { data: expired, error } = await service
    .from('pending_coppa_signups')
    .select('id, student_id')
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())

  if (error) {
    console.error('[coppa-cleanup] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let deleted = 0, skipped = 0, orphans = 0
  const errors = []

  for (const row of (expired ?? [])) {
    // Re-check the student before deleting — never delete an account that did get
    // consent (defends against a status field that lagged the approval).
    const { data: prof } = await service
      .from('profiles')
      .select('coppa_consent_given')
      .eq('id', row.student_id)
      .single()

    if (!prof) {
      // Profile already gone — clean the orphan pending row so it stops re-querying.
      await service.from('pending_coppa_signups').update({ status: 'expired' }).eq('id', row.id)
      orphans++
      continue
    }
    if (prof.coppa_consent_given) {
      await service.from('pending_coppa_signups').update({ status: 'approved' }).eq('id', row.id)
      skipped++
      continue
    }

    // Delete the auth user → cascades profile, sessions, messages, paragraphs,
    // relationships, and this pending row (all ON DELETE CASCADE).
    const { error: delErr } = await service.auth.admin.deleteUser(row.student_id)
    if (delErr) {
      console.error('[coppa-cleanup] deleteUser failed:', row.student_id, delErr.message)
      errors.push({ student_id: row.student_id, error: delErr.message })
      continue // leave status='pending' so the next run retries
    }
    deleted++
  }

  // ── Profile-side sweep — the pending-row query above can't see two cases ──────
  // (1) an under-13 who never submitted a parent email (no pending row exists), and
  // (2) a pending row a late /coppa/consent visit already flipped to status=
  // 'expired' (dropping it out of the status='pending' query). Both leave an
  // unconsented under-13 account alive past the promised 7 days. Sweep directly:
  // consent required, not given, account older than 7 days, and no ACTIVE pending
  // window (a live consent request defers deletion to the pending-row path above —
  // its expiry restarts the clock from the moment the email went out).
  let swept = 0
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: stale, error: staleErr } = await service
    .from('profiles')
    .select('id')
    .eq('coppa_consent_required', true)
    .eq('coppa_consent_given', false)
    .lt('created_at', cutoff)

  if (staleErr) {
    console.error('[coppa-cleanup] sweep query error:', staleErr)
    errors.push({ sweep: staleErr.message })
  }

  for (const row of (stale ?? [])) {
    // Defer to an active (unexpired) consent request — the parent may still approve.
    const { data: active } = await service
      .from('pending_coppa_signups')
      .select('id')
      .eq('student_id', row.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .limit(1)
    if (active?.length) continue

    // Re-check consent at the moment of deletion (same lag defense as above).
    const { data: prof } = await service
      .from('profiles')
      .select('coppa_consent_given')
      .eq('id', row.id)
      .single()
    if (!prof || prof.coppa_consent_given) continue

    const { error: delErr } = await service.auth.admin.deleteUser(row.id)
    if (delErr) {
      console.error('[coppa-cleanup] sweep deleteUser failed:', row.id, delErr.message)
      errors.push({ student_id: row.id, error: delErr.message })
      continue
    }
    swept++
  }

  const summary = { checked: expired?.length ?? 0, deleted, skipped, orphans, swept, errors }
  console.log('[coppa-cleanup]', JSON.stringify(summary))
  return NextResponse.json({ ok: true, ...summary })
}
