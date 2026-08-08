import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { after } from 'next/server'
import { maybeGrantBetaCircle, classifyClaimFailure, claimFailureBody, INVALID_CODE_MESSAGE, accessCodeAlertLevel } from '@/lib/access'
import { sendAccessCodeAlert } from '@/lib/notifications'

// POST /api/access/redeem — redeem a Beta Circle access code.
//
// Grants the signed-in user coach access (profiles.access_granted=true) and, if the
// code grants it and the fluid cap of 100 live members isn't reached, a Beta Circle
// slot (profiles.is_beta_circle=true). Authed + rate-limited; ALL writes go through
// the service role (access_codes is RLS-enabled with no client policies, and the gate
// columns on profiles are service-role territory). Requires migrations 045 + 049.
//
// A code may carry an OPTIONAL redemption ceiling (access_codes.max_uses; NULL =
// unlimited). The ceiling is claimed ATOMICALLY in Postgres — see migration 049 and
// the claim block below — because a leaked uncapped code means unbounded free
// coach/TTS/mic spend, and a JS-side check over a read counter is not a cap.

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Denial-of-abuse backstop: cap redemption attempts per user (fails open).
  if (!await checkRateLimit(`access:redeem:${user.id}`, 10, 3600)) {
    return rateLimited('Too many tries just now — please wait a bit and try again.')
  }

  const body = await request.json().catch(() => ({}))
  const code = (typeof body?.code === 'string' ? body.code : '').trim().toLowerCase()
  if (!code) {
    return Response.json({ error: 'Enter your Beta Circle code.', code: 'invalid_code' }, { status: 400 })
  }

  const service = createServiceClient()

  // ── Idempotency: never burn a use on someone who already has access ────────
  // A double-submit, a back-button, or a refresh must not consume a slot from a
  // capped code. Short-circuit BEFORE the claim.
  //
  // Tradeoff (deliberate): for an already-granted user we don't validate the code
  // at all, so a bogus code reads as success. That leaks nothing (they already have
  // access, and every code is equally "accepted") and it's strictly safer than
  // touching the counter. We don't retry maybeGrantBetaCircle here either — every
  // path that sets access_granted (redeem, invite, COPPA consent) already made that
  // attempt, so a re-redeem could only hand out a cap slot for an unvalidated code.
  // Topping someone up is an admin action (/admin → Beta Circle → Add).
  const { data: existing } = await service
    .from('profiles').select('access_granted, is_beta_circle').eq('id', user.id).maybeSingle()
  if (existing?.access_granted === true) {
    return Response.json({
      access_granted: true,
      beta_circle: existing.is_beta_circle === true,
      cap_reached: false,
      already_granted: true,
    })
  }

  // ── The atomic claim ───────────────────────────────────────────────────────
  // ONE statement: bump uses and hand back the row only if the code is active AND
  // (uncapped OR still under its ceiling). Two simultaneous redeemers at the
  // boundary can't both win — the loser blocks on the row lock, re-evaluates the
  // predicate against the committed value, and gets zero rows. Replacing this with
  // select-then-update would reopen the race that makes the cap meaningless.
  //
  // ORDERING: claim FIRST, then grant. If a later grant write fails, one use is
  // consumed for nothing — accepted, because the inverse (grant, then fail to
  // claim) hands out free access above the cap, which is the whole thing we're
  // preventing. An over-consumed use is a support ticket; an over-granted code is
  // an unbounded model bill.
  const { data: claimed, error: claimErr } = await service.rpc('claim_access_code', { p_code: code })
  if (claimErr) {
    console.error('[access/redeem] claim rpc failed:', claimErr.message)
    return Response.json({ error: 'Something went wrong unlocking your account. Please try again.' }, { status: 500 })
  }

  // rpc() on a set-returning function yields an array (possibly empty).
  const accessCode = Array.isArray(claimed) ? claimed[0] : claimed
  if (!accessCode) {
    // Zero rows is deliberately ambiguous (missing / inactive / exhausted). Re-select
    // to pick the right copy: a real invitee whose code just filled up deserves a
    // better message than "that code isn't valid". Classification is pure + tested.
    const { data: row, error: lookupErr } = await service
      .from('access_codes')
      .select('code, active, uses, max_uses')
      .eq('code', code)
      .maybeSingle()
    if (lookupErr) {
      // Can't classify → fall back to the vaguer, pre-existing message.
      console.error('[access/redeem] claim classification lookup failed:', lookupErr.message)
      return Response.json({ error: INVALID_CODE_MESSAGE, code: 'invalid_code' }, { status: 400 })
    }
    return Response.json(claimFailureBody(classifyClaimFailure(row)), { status: 400 })
  }

  // Grant coach access + record which code was used and when.
  const { error: accessErr } = await service
    .from('profiles')
    .update({ access_granted: true, access_code_used: code, access_code_at: new Date().toISOString() })
    .eq('id', user.id)
  if (accessErr) {
    console.error('[access/redeem] access grant failed:', accessErr.message)
    return Response.json({ error: 'Something went wrong unlocking your account. Please try again.' }, { status: 500 })
  }

  // Beta Circle: granted only while the fluid cap of 100 LIVE members isn't reached
  // (shared cap logic in lib/access.js — same helper the invite/consent paths use).
  // A small TOCTOU race at exactly the cap is acceptable (the cap is a cohort size,
  // not a spend limit), so we don't lock/serialize. This is separate from the code's
  // own max_uses, which IS a spend limit and IS serialized above.
  let betaCircle = false
  let capReached = false
  if (accessCode.grants_beta_circle) {
    betaCircle = await maybeGrantBetaCircle(service, user.id)
    capReached = !betaCircle
  }

  // Ops alert when this redemption crossed a threshold on the code (80% / full).
  // Hitting the ceiling already decommissions the code — claim_access_code stops
  // matching it — but silently; without this you'd only notice by opening /admin.
  // Deferred + fully guarded: an email problem must never affect the student who
  // just redeemed successfully.
  const alertLevel = accessCodeAlertLevel(accessCode.uses, accessCode.max_uses)
  if (alertLevel) {
    after(async () => {
      try {
        const { data: admins } = await service
          .from('profiles').select('email').eq('role', 'admin').not('email', 'is', null)
        await sendAccessCodeAlert({
          to: (admins ?? []).map(a => a.email),
          code,
          uses: accessCode.uses,
          maxUses: accessCode.max_uses,
          level: alertLevel,
        })
      } catch (e) {
        console.error('[access/redeem] threshold alert failed:', e)
      }
    })
  }

  return Response.json({ access_granted: true, beta_circle: betaCircle, cap_reached: capReached })
}
