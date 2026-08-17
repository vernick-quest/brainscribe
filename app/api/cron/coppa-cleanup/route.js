import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { purgeDecision, RETENTION_SUMMARY } from '@/lib/subscriberRetention'
import { purgeSubscriberEmail } from '@/lib/subscribers'

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

  let deleted = 0, skipped = 0, orphans = 0, subscribersPurged = 0
  const errors = []

  // `subscribers` (migrations 044/066) holds waitlist/newsletter email addresses and
  // is NOT reached by deleteUser's cascade — it has no FK to profiles or auth.users.
  // So an under-13 deleted under the 7-day rule could leave their address behind.
  //
  // We already promise otherwise, in our own words: the Privacy Policy says the
  // account and "all associated data" are "permanently deleted", and /welcome tells
  // the child "we delete everything we've collected". This makes that true. It is a
  // data-minimizing correction to match a published commitment — it does NOT
  // presume any answer to the open COPPA questions about the waitlist itself
  // (age gate, retention policy, disclosure), which are counsel's and are written
  // up in COPPA-WAITLIST-REVIEW-2026-08-16.md.
  //
  // Best-effort by design: the account deletion has already succeeded by the time
  // this runs, so a failure here is logged and counted, never fatal to the run.
  async function purgeSubscriber(email) {
    if (!email) return
    const { purged, error: subErr } = await purgeSubscriberEmail(service, email)
    if (subErr) { errors.push({ subscribers: subErr }); return }
    if (purged) subscribersPurged++
  }

  for (const row of (expired ?? [])) {
    // Re-check the student before deleting — never delete an account that did get
    // consent (defends against a status field that lagged the approval). `email` is
    // read HERE because the profile row is cascaded away by deleteUser below, and
    // it's the only key `subscribers` can be matched on.
    const { data: prof } = await service
      .from('profiles')
      .select('coppa_consent_given, email')
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
    await purgeSubscriber(prof.email)
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

    // Re-check consent at the moment of deletion (same lag defense as above), and
    // read the email before the profile row cascades away.
    const { data: prof } = await service
      .from('profiles')
      .select('coppa_consent_given, email')
      .eq('id', row.id)
      .single()
    if (!prof || prof.coppa_consent_given) continue

    const { error: delErr } = await service.auth.admin.deleteUser(row.id)
    if (delErr) {
      console.error('[coppa-cleanup] sweep deleteUser failed:', row.id, delErr.message)
      errors.push({ student_id: row.id, error: delErr.message })
      continue
    }
    await purgeSubscriber(prof.email)
    swept++
  }

  // ── Waitlist retention (lib/subscriberRetention.js) ──────────────────────────
  // `subscribers` had no retention policy at all: an address stayed forever. The
  // windows are PUBLISHED in the privacy policy (12 months uncontacted / 90 days
  // dismissed), so the constants and the policy move together — see the warning in
  // that module. An address belonging to an existing account is never touched here;
  // it follows the account lifecycle, and the COPPA purge above already removes it
  // the moment that account is deleted.
  //
  // Runs after the deletion passes on purpose: those may have just removed profiles,
  // and the profile lookup below should see the post-deletion world.
  let subscribersExpired = 0
  const expiredReasons = {}
  const { data: subs, error: subsErr } = await service
    .from('subscribers')
    .select('id, email, created_at, invited_at, dismissed_at')

  if (subsErr) {
    console.error('[coppa-cleanup] subscribers read failed:', subsErr.message)
    errors.push({ retention: subsErr.message })
  } else if (subs?.length) {
    // One lookup rather than a query per row, and NOT `.in('email', lowercased)`.
    //
    // That was the shape here first, and its own comment gave the reason it fails:
    // /api/subscribe lowercases on insert but a profile email comes from Google and is
    // "not guaranteed to be" — and `.in()` is an exact match. Under exactly the
    // condition the comment describes, the lookup misses a real user's profile,
    // `hasProfile` comes back false, and rule 1 ("never purge a user") silently does
    // not hold on an IRREVERSIBLE delete. Measured 2026-08-16: all 21 profile emails
    // are lowercase, so it was latent rather than live — but a safety rule that
    // depends on data happening to be normalized is not a safety rule.
    //
    // Reading every profile email and comparing lowercased in JS removes the
    // dependency. At this scale it is one small indexed read either way.
    const { data: profs, error: profErr } = await service
      .from('profiles').select('email')

    if (profErr) {
      // FAIL SAFE: without the profile list we cannot honour "never purge a user",
      // so purge nothing this run. The next run retries.
      console.error('[coppa-cleanup] retention profile lookup failed — skipping purge:', profErr.message)
      errors.push({ retention: profErr.message })
    } else {
      const accounts = new Set((profs ?? []).map(p => String(p.email ?? '').trim().toLowerCase()))
      const now = new Date()
      for (const s of subs) {
        const email = String(s.email ?? '').trim().toLowerCase()
        const { purge, reason } = purgeDecision(s, { hasProfile: accounts.has(email), now })
        if (!purge) continue
        const { error: delErr } = await service.from('subscribers').delete().eq('id', s.id)
        if (delErr) {
          console.error('[coppa-cleanup] retention delete failed:', delErr.message)
          errors.push({ retention: delErr.message })
          continue
        }
        expiredReasons[reason] = (expiredReasons[reason] ?? 0) + 1
        subscribersExpired++
      }
    }
  }

  const summary = {
    checked: expired?.length ?? 0, deleted, skipped, orphans, swept,
    subscribersPurged, subscribersExpired, expiredReasons,
    retention: RETENTION_SUMMARY, errors,
  }
  console.log('[coppa-cleanup]', JSON.stringify(summary))
  return NextResponse.json({ ok: true, ...summary })
}
