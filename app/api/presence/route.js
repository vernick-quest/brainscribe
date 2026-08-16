import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { COALESCE_MS } from '@/lib/presence'

// POST /api/presence — "I'm still here."
//
// The middleware stamp can only observe REQUESTS, and a student reading a coaching
// page makes none, so presence went stale while someone sat in front of the app.
// This is the heartbeat that closes that gap. It carries no body and returns no data.
//
// Chattiness is handled by separating ping rate from WRITE rate: the browser pings
// once a minute, and this coalesces to at most one DB write per COALESCE_MS per
// user via a short-lived cookie. 60 pings/hour become ~30 writes/hour for an
// actively-present user, and none at all for an idle or hidden tab (the client
// stops pinging). The cookie is shared with the middleware stamp, so the two
// mechanisms throttle each other instead of double-writing.
const PRESENCE_COOKIE = 'bs_seen'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Not an error: a logged-out tab pinging is simply nobody to record.
  if (!user) return NextResponse.json({ ok: true, recorded: false })

  const res = NextResponse.json({ ok: true, recorded: true })
  res.cookies.set(PRESENCE_COOKIE, '1', {
    maxAge: Math.floor(COALESCE_MS / 1000),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })

  // Best-effort: presence must never be able to fail a request the user depends on.
  try {
    const { error } = await createServiceClient().rpc('record_seen', { p_user_id: user.id })
    if (error) console.error('[presence] record_seen failed:', error.message)
  } catch (e) {
    console.error('[presence] record_seen threw:', e?.message ?? e)
  }

  return res
}
