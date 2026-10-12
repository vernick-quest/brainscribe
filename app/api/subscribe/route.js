import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { sendWaitlistAck, sendAdminAlert } from '@/lib/notifications'
import { notifyOnSubscribe } from '@/lib/accessAlerts'
import { NextResponse } from 'next/server'
import { after } from 'next/server'

// Basic shape check — deliberately permissive (we're not verifying deliverability
// here, just rejecting obvious junk). Caps length to avoid abuse.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/subscribe  { email, source }
// Public "get new posts" signup. Writes through the service client (the table has
// no client INSERT policy — see migration 044), so a client can only add itself by
// going through this validated, rate-limited endpoint. Idempotent: re-subscribing
// is a no-op, never an error.
export async function POST(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const email = String(body?.email ?? '').trim().toLowerCase()
  const source = (String(body?.source ?? '').trim().slice(0, 40)) || null

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 })
  }

  // Spam / abuse backstop (fails open like the other limits): cap attempts per
  // address per hour so the endpoint can't be hammered to bloat the list.
  if (!await checkRateLimit(`subscribe:${email}`, 5, 3600)) {
    return rateLimited('Too many attempts just now — please try again later.')
  }

  const svc = createServiceClient()
  // Upsert on the unique email → a repeat signup silently succeeds (no duplicate,
  // no leaked "you're already subscribed" enumeration).
  //
  // .select() is what makes the acknowledgment safe to send. ignoreDuplicates uses
  // ON CONFLICT DO NOTHING, so the returned rows are the INSERTED ones only: an empty
  // array means this address was already on the list. Without reading that value there
  // is no way to tell a first request from a fifth, and re-submitting the form would
  // mail the person again every time.
  const { data: inserted, error } = await svc
    .from('subscribers')
    .upsert({ email, source }, { onConflict: 'email', ignoreDuplicates: true })
    .select('email')

  if (error) {
    console.error('[subscribe]', error.message)
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  }

  // A genuine new ACCESS request gets told in BOTH directions:
  //   1. the requester gets an acknowledgment (waitlist source only — the same form
  //      collects blog subscribers, and "we'll send you a code" is nonsense to them);
  //   2. the ADMIN gets an alert. Someone asked on 2026-07-29 and waited in silence
  //      until 08-16; the fix for that built only direction 1, and someone who asked on
  //      2026-09-02 then went 19+ days with the owner never hearing about it.
  // A re-submit (empty `inserted`) does neither. Blog-only signups never alert.
  // The decision lives in lib/accessAlerts.js so it is unit-tested.
  //
  // after() rather than a floating promise — a serverless function can be reclaimed the
  // moment the response returns, and a send that never runs is exactly the silence this
  // is fixing. The requester's response never waits on the mail.
  if (inserted?.length) {
    after(async () => {
      try {
        const result = await notifyOnSubscribe({
          email, source, inserted, service: svc,
          sendAck: sendWaitlistAck, sendAlert: sendAdminAlert,
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
        })
        if (result.alert !== 'sent' && result.alert !== 'not_access_request') {
          console.error('[subscribe] admin NOT alerted about', email, '— reason:', result.alert)
        }
      } catch (e) {
        console.error('[subscribe] post-signup notifications threw for', email, e)
      }
    })
  }

  return NextResponse.json({ ok: true })
}
