import { createServiceClient } from '@/lib/supabase/service'
import { verifyUnsubscribeToken } from '@/lib/blogMail'
import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/unsubscribe?e=<email>&t=<token>  → a human clicked the link
// POST /api/unsubscribe?e=<email>&t=<token>  → RFC 8058 one-click, from Gmail/Yahoo
//
// Both do the same thing. POST exists because bulk-sender rules expect
// List-Unsubscribe-Post one-click, and the mail client POSTs without ever rendering a
// page; GET exists because people also click the link in the body.
//
// 🔴 MUST WORK LOGGED OUT. Added to publicPaths in lib/supabase/middleware.js — a
// subscriber has no account, so an auth redirect here means the unsubscribe silently
// does not happen and the next mailing goes out anyway.
//
// Never reveals whether an address is on the list: an unknown address, an already-
// unsubscribed one and a successful opt-out all return the same success. The page is
// reachable by anyone with a link, so anything else is an enumeration oracle.
// ─────────────────────────────────────────────────────────────────────────────

function page(title, body) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title} · BrainScribe</title>
     <div style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.5rem;color:#211D17;line-height:1.6">
       <h1 style="font-size:1.25rem;color:#14385A;margin:0 0 .75rem">${title}</h1>
       <p style="margin:0 0 1.5rem;color:#4A4439">${body}</p>
       <a href="https://www.brainscribe.io" style="color:#B4560F;font-weight:700">← brainscribe.io</a>
     </div>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

async function unsubscribe(request) {
  const { searchParams } = new URL(request.url)
  const email = String(searchParams.get('e') ?? '').trim().toLowerCase()
  const token = searchParams.get('t') ?? ''

  if (!email || !verifyUnsubscribeToken(email, token)) {
    // A bad or rotated token is the one case worth distinguishing, because the person
    // still wants OUT and needs a route that works. The privacy policy already
    // publishes this address, so it is not a new promise.
    return { ok: false, message: 'That link has expired or is not valid.' }
  }

  try {
    // Stamp rather than delete: the row IS the suppression record. Deleting it would
    // make the address eligible again the moment anything re-adds it, which is how
    // people get mailed after opting out. lib/subscriberRetention.js rule 0 keeps it.
    const { error } = await createServiceClient()
      .from('subscribers')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('email', email)
    if (error) {
      console.error('[unsubscribe] update failed:', error.message)
      return { ok: false, message: 'Something went wrong on our side.' }
    }
    // A zero-row update is deliberately treated as success — the address is not on the
    // list, so the outcome the person wanted is already true.
    return { ok: true }
  } catch (e) {
    console.error('[unsubscribe] threw:', e)
    return { ok: false, message: 'Something went wrong on our side.' }
  }
}

export async function GET(request) {
  const r = await unsubscribe(request)
  return r.ok
    ? page("You're unsubscribed", "You won't get any more blog emails from us. Nothing else about your account changes.")
    : page('We could not do that', `${r.message} Email <a href="mailto:brainscribe.io@gmail.com" style="color:#B4560F">brainscribe.io@gmail.com</a> and we'll remove you by hand.`)
}

export async function POST(request) {
  const r = await unsubscribe(request)
  // One-click clients read the status, not the body. A failure must not return 200 —
  // Gmail treats that as "handled" and the person stays subscribed.
  return NextResponse.json({ ok: r.ok }, { status: r.ok ? 200 : 400 })
}
