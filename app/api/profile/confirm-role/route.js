import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { isCoppaProtected } from '@/lib/coppa'
import { after } from 'next/server'
import { notifyNewAccount } from '@/lib/accessAlerts'
import { sendAdminAlert } from '@/lib/notifications'

const ALLOWED_ROLES = ['student', 'parent', 'teacher']

export async function PATCH(request) {
  // Authenticate with the user-scoped client, but perform all gate/role/consent
  // writes through the service client. Migration 020 REVOKEs UPDATE on these
  // columns from `authenticated`, so a user-scoped UPDATE would fail outright —
  // service-role bypasses the revoke. (Defense-in-depth: the gate can only move
  // through this guarded endpoint, never a raw supabase-js PATCH from the client.)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Role/age declarations happen a handful of times per account lifetime —
  // anything faster is probing the gate.
  if (!await checkRateLimit(`confirm-role:${user.id}`, 10, 3600)) {
    return rateLimited('Too many attempts — please try again later.')
  }

  const service = createServiceClient()

  const { role: requestedRole, age_bracket } = await request.json()

  // COPPA actual-knowledge is sticky: once an account has self-declared under-13
  // (recorded as age_bracket='under13' or coppa_consent_required=true), it can
  // NEVER re-declare 13+ to escape the consent gate. Without this, a child could
  // re-open /welcome, pick "13 or older," and reach the coach with no parent
  // approval. Fetch the existing profile and reject any such downgrade outright.
  const { data: existing, error: existingErr } = await service
    .from('profiles')
    .select('age_bracket, coppa_consent_required, coppa_consent_given')
    .eq('id', user.id)
    .single()

  // FAIL CLOSED. The error was previously discarded, and isCoppaProtected(null) is
  // false — so a failed read silently skipped the under-13 lock and let a protected
  // account re-declare itself 13+, escaping parental consent. A transient read failure
  // must cost a retry, never a bypass of the most sensitive invariant in the app.
  // (Found 2026-10-11 by the admin lane while working on this file; it left this read
  // untouched and reported it rather than folding a COPPA change into an unrelated one.)
  if (existingErr) {
    console.error('[confirm-role] COPPA read FAILED — refusing role change rather than guess:', user.id, existingErr.message)
    return Response.json(
      { error: 'We could not check your account just now. Please try again.', code: 'coppa_read_failed' },
      { status: 503 }
    )
  }

  if (isCoppaProtected(existing) && age_bracket === '13plus') {
    return Response.json(
      { error: 'This account is registered as under 13 and needs parental approval.', code: 'coppa_locked' },
      { status: 403 }
    )
  }

  // Under-13 accounts can ONLY be students — never parent/teacher — regardless of
  // what the client sends. Age-first onboarding enforces this in the UI; this is
  // the server-side backstop that keeps a minor from ever holding a watcher role.
  const role = age_bracket === 'under13' ? 'student' : requestedRole

  // Admins are never self-assigned — only manually set in the DB
  if (!ALLOWED_ROLES.includes(role)) {
    return Response.json({ error: 'Invalid role' }, { status: 400 })
  }

  const update = { role, role_confirmed: true }

  if (age_bracket === '13plus' || age_bracket === 'under13') {
    update.age_bracket = age_bracket
  }

  // Under-13 students need parental consent before accessing the app. Never keep a
  // profile photo for a minor (COPPA data-minimization) — drop any avatar Google
  // populated on login. Migration 019 backfills existing rows; this keeps it true
  // for anyone who confirms under-13 from here on.
  if (age_bracket === 'under13' && role === 'student') {
    update.coppa_consent_required = true
    update.coppa_consent_given = false
    update.avatar_url = null
  }

  // Two statements, same net write as one unconditional UPDATE — split so we learn
  // whether THIS call is the one that confirmed the account for the first time.
  //
  // The first only matches while role_confirmed is still false/null. Postgres takes the
  // row lock and re-checks that predicate, so of two simultaneous first-confirms exactly
  // one gets the row back; the other falls through to the plain update below (a role
  // re-pick via "← Back" takes the same path). That return value is what makes the
  // admin's new-account alert fire ONCE per account rather than once per call.
  const { data: firstRows, error: firstErr } = await service
    .from('profiles')
    .update(update)
    .eq('id', user.id)
    .or('role_confirmed.is.null,role_confirmed.eq.false')
    .select('id')

  // If the conditional statement itself fails, signup must NOT fail with it — that
  // would trade a missing email for a broken onboarding step. Fall through to the
  // plain update (the pre-alert behaviour) and say loudly that the alert is lost.
  if (firstErr) console.error('[confirm-role] first-confirm update FAILED — new-account alert will NOT fire for', user.id, ':', firstErr.message)

  const firstConfirm = !firstErr && (firstRows?.length ?? 0) > 0
  if (!firstConfirm) {
    const { data: rows, error: reErr } = await service
      .from('profiles')
      .update(update)
      .eq('id', user.id)
      .select('id')
    if (reErr) return Response.json({ error: reErr.message }, { status: 500 })
    // Zero rows = there is no profile row to confirm (e.g. the signup trigger has not
    // created it). That used to return ok in silence; it still returns ok (behaviour
    // unchanged), but no longer quietly.
    if (!rows?.length) console.error('[confirm-role] update matched ZERO rows — no profile for user', user.id)
  }

  // A new account just became real: tell the admin. Once per account (see above),
  // deferred, and fully guarded — a mail problem must never affect the signup.
  // For 13+ the code step comes before the role picker, so a redeemed code is
  // already recorded on the profile by now.
  if (firstConfirm) {
    after(async () => {
      try {
        // A separate read, deliberately NOT folded into the COPPA `existing` select
        // above: a column problem there nulls `existing` and silently disables the
        // sticky under-13 check. confirm-role never writes these three columns, so
        // reading them after the update sees the same values as before it.
        const { data: acct, error: acctErr } = await service
          .from('profiles').select('email, access_granted, access_code_used').eq('id', user.id).maybeSingle()
        if (acctErr) console.error('[confirm-role] new-account alert: profile read failed — alerting with what we have:', acctErr.message)
        const result = await notifyNewAccount({
          service,
          email: acct?.email ?? user.email,
          role,
          ageBracket: update.age_bracket ?? existing?.age_bracket ?? null,
          accessCode: acct ? (acct.access_code_used ?? null) : 'unknown (profile read failed)',
          accessGranted: acct ? acct.access_granted === true : undefined,
          sendAlert: sendAdminAlert,
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
        })
        if (result.alert !== 'sent') {
          console.error('[confirm-role] admin NOT alerted about new account', user.id, '— reason:', result.alert)
        }
      } catch (e) {
        console.error('[confirm-role] new-account alert threw for', user.id, e)
      }
    })
  }

  return Response.json({ ok: true, role, age_bracket })
}
