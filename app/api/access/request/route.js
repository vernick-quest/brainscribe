import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { evaluateAccessRequest, recordAccessRequest, WELCOME_REQUEST_SOURCE } from '@/lib/accessRequest'
import { notifyOnSubscribe } from '@/lib/accessAlerts'
import { sendWaitlistAck, sendAdminAlert } from '@/lib/notifications'
import { after } from 'next/server'

// POST /api/access/request  { ageBracket: '13plus' }
//
// "No code? Ask for one" on the /welcome code step. A signed-in 13+ person with no code
// used to stop there without ANY alert reaching the owner (the role-confirm alert is
// past the code wall, and the waitlist form is somewhere else entirely). This files the
// same `subscribers` access request the landing form does and runs the same
// notifyOnSubscribe — see lib/accessRequest.js for the full reasoning.
//
// 🔴 The address is the SESSION's. Nothing in the body is read except the age assertion;
// an `email` field, if sent, is ignored.
// 🔴 COPPA: refused server-side for any protected (under-13) account — the hidden button
// on the client is not the control.
export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // A person asks once or twice; anything faster is a script. Fails open like the rest.
  if (!await checkRateLimit(`access:request:${user.id}`, 5, 3600)) {
    return rateLimited('Too many tries just now — please wait a bit and try again.')
  }

  const body = await request.json().catch(() => ({}))
  const assertedBracket = typeof body?.ageBracket === 'string' ? body.ageBracket : null

  const service = createServiceClient()

  // FAIL CLOSED on the COPPA read — same rule as confirm-role. isCoppaProtected(null) is
  // false, so a swallowed error here would wave a protected account straight through.
  const { data: profile, error: profileErr } = await service
    .from('profiles')
    .select('role, age_bracket, coppa_consent_required, birthdate, access_granted')
    .eq('id', user.id)
    .maybeSingle()
  if (profileErr) {
    console.error('[access/request] profile read FAILED — refusing rather than guess the age gate:', user.id, profileErr.message)
    return Response.json(
      { error: 'We could not check your account just now. Please try again.', code: 'profile_read_failed' },
      { status: 503 }
    )
  }

  const verdict = evaluateAccessRequest({ profile, assertedBracket })
  if (!verdict.ok) {
    if (verdict.code === 'already_has_access') {
      return Response.json({ ok: true, status: 'already_has_access' })
    }
    if (verdict.code === 'coppa_protected') {
      console.warn('[access/request] refused for a COPPA-protected account:', user.id)
    }
    return Response.json({ error: verdict.error, code: verdict.code }, { status: verdict.status })
  }

  // The session's address. Google sign-in always supplies one; if it somehow does not,
  // say so rather than file a request nobody can answer.
  const email = String(user.email ?? '').trim().toLowerCase()
  if (!email) {
    console.error('[access/request] signed-in user has NO email — cannot file a request:', user.id)
    return Response.json({ error: 'Your account has no email address on it. Please email us instead.', code: 'no_email' }, { status: 400 })
  }

  const recorded = await recordAccessRequest(service, email)
  if (!recorded.ok) {
    return Response.json(
      { error: 'We could not send your request just now. Please try again, or email us.', code: 'request_failed' },
      { status: 500 }
    )
  }

  // ONE alert per address: `inserted` is non-empty only for the call that created (or
  // converted) the row. after() so the send survives the response being returned.
  if (recorded.outcome === 'requested') {
    const inserted = recorded.inserted
    after(async () => {
      try {
        const result = await notifyOnSubscribe({
          email, source: WELCOME_REQUEST_SOURCE, inserted, service,
          sendAck: sendWaitlistAck, sendAlert: sendAdminAlert,
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
        })
        if (result.alert !== 'sent') {
          console.error('[access/request] admin NOT alerted about', email, '— reason:', result.alert)
        }
      } catch (e) {
        console.error('[access/request] notifications threw for', email, e)
      }
    })
  }

  // The address is echoed back so the screen can say where the code will arrive — it is
  // the caller's own, from their own session.
  return Response.json({ ok: true, status: recorded.outcome, email })
}
