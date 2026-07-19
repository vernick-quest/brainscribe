import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { maybeGrantBetaCircle } from '@/lib/access'

// POST /api/access/redeem — redeem a Beta Circle access code.
//
// Grants the signed-in user coach access (profiles.access_granted=true) and, if the
// code grants it and the fluid cap of 100 live members isn't reached, a Beta Circle
// slot (profiles.is_beta_circle=true). Authed + rate-limited; ALL writes go through
// the service role (access_codes is RLS-enabled with no client policies, and the gate
// columns on profiles are service-role territory). Requires migration 045.

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
    return Response.json({ error: "Enter your Beta Circle code.", code: 'invalid_code' }, { status: 400 })
  }

  const service = createServiceClient()

  // Validate the code (service role — access_codes is deny-by-default under RLS).
  const { data: accessCode } = await service
    .from('access_codes')
    .select('code, grants_beta_circle, active')
    .eq('code', code)
    .eq('active', true)
    .maybeSingle()

  if (!accessCode) {
    return Response.json(
      { error: "That code isn't valid. Check with whoever invited you.", code: 'invalid_code' },
      { status: 400 }
    )
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
  // not a hard limit), so we don't lock/serialize.
  let betaCircle = false
  let capReached = false
  if (accessCode.grants_beta_circle) {
    betaCircle = await maybeGrantBetaCircle(service, user.id)
    capReached = !betaCircle
  }

  // Bump the code's usage counter (best-effort telemetry; never fail the redeem on
  // it). Read-modify-write — racy under concurrency, but the counter is informational
  // only (not the source of truth for the cap; that's the live is_beta_circle count).
  const { data: cur } = await service.from('access_codes').select('uses').eq('code', code).maybeSingle()
  if (cur) {
    await service.from('access_codes').update({ uses: (cur.uses ?? 0) + 1 }).eq('code', code)
  }

  return Response.json({ access_granted: true, beta_circle: betaCircle, cap_reached: capReached })
}
