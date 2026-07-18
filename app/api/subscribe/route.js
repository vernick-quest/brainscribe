import { createServiceClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { NextResponse } from 'next/server'

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
  const { error } = await svc
    .from('subscribers')
    .upsert({ email, source }, { onConflict: 'email', ignoreDuplicates: true })

  if (error) {
    console.error('[subscribe]', error.message)
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
