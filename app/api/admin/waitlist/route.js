import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildWaitlistView, isAccessRequest } from '@/lib/waitlist'
import { purgeSubscriberEmail } from '@/lib/subscribers'
import { sendWaitlistCode } from '@/lib/notifications'
import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/waitlist  → { items, counts, needsAction, codes }
// POST /api/admin/waitlist  → { action: 'send_code' | 'dismiss' | 'restore', ... }
//
// The approval queue behind /admin → Tools. Before this existed, `subscribers` was
// written by /api/subscribe and read by nothing: no notification, no surface, no
// acknowledgment. Someone asked on 2026-07-29 and was still waiting on 08-16.
//
// The load-bearing detail is the JOIN. `subscribers` is a list of addresses typed
// into a form, NOT a list of people waiting — measured 2026-08-16, two of the three
// rows belonged to people who had already signed up and redeemed a code. A queue
// built on the table alone would have invited people who were already inside, so
// every row is resolved against its real account before anything is shown.
//
// Service role throughout: subscribers is RLS admin-read-only with no client write
// policy (044), and the profile columns it joins to are service-role territory.
// ─────────────────────────────────────────────────────────────────────────────

// Same server-side role lookup as the rest of /api/admin/* — never trust the client.
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 }
  return { user }
}

async function loadState(service) {
  // Fail soft on the 066 columns. Between deploying this and pasting the migration by
  // hand there is a real window, and a 400 there would leave the card showing nothing
  // but an error — indistinguishable from "no one has asked". Selecting the base
  // columns still answers the important question (who is on the list); it just cannot
  // yet show who has been sent a code.
  let { data: rows, error: rowsErr } = await service
    .from('subscribers')
    .select('email, source, created_at, invited_at, invited_code, dismissed_at')
    .order('created_at', { ascending: true })
  if (rowsErr) {
    console.warn('[admin/waitlist] approval columns unavailable (migration 066 not applied yet):', rowsErr.message)
    const base = await service
      .from('subscribers')
      .select('email, source, created_at')
      .order('created_at', { ascending: true })
    if (base.error) throw new Error(base.error.message)
    rows = base.data
  }

  const emails = (rows ?? []).map(r => String(r.email ?? '').toLowerCase()).filter(Boolean)

  // Resolve every address against its account in one read. `.in()` on an empty array
  // is a query for nothing, so guard it rather than relying on an empty result.
  const { data: profiles } = emails.length
    ? await service
        .from('profiles')
        .select('id, email, role, full_name, access_code_used, created_at')
        .in('email', emails)
    : { data: [] }

  // Activity per matched account. Counting SESSIONS, not messages: a session row is
  // what "started an assignment" means, and it is one indexed read per account on a
  // list this size. Turn counts are the finer signal but not worth N more queries
  // until the list outgrows a screen.
  const accountsByEmail = {}
  for (const p of profiles ?? []) {
    const { count } = await service
      .from('sessions').select('id', { count: 'exact', head: true }).eq('student_id', p.id)
    accountsByEmail[String(p.email).toLowerCase()] = {
      role: p.role,
      full_name: p.full_name,
      access_code_used: p.access_code_used,
      sessionCount: count ?? 0,
      // turnCount is not fetched; classify() treats sessionCount as sufficient for
      // "writing" and stalled is derived from it. Kept in the shape so the pure
      // logic stays honest about what it was given.
      turnCount: 0,
    }
  }

  // Codes the admin can actually send — an inactive or exhausted code would be worse
  // than no email at all, so they are filtered here rather than in the UI.
  const { data: codes } = await service
    .from('access_codes')
    .select('code, label, active, uses, max_uses')
    .eq('active', true)
    .order('created_at', { ascending: true })
  const sendable = (codes ?? []).filter(c => c.max_uses == null || (c.uses ?? 0) < c.max_uses)

  return { ...buildWaitlistView(rows ?? [], accountsByEmail), codes: sendable }
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    return NextResponse.json(await loadState(createServiceClient()))
  } catch (e) {
    console.error('[admin/waitlist] load failed:', e?.message ?? e)
    return NextResponse.json({ error: 'Could not load the waitlist.' }, { status: 500 })
  }
}

export async function POST(request) {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  const action = typeof body?.action === 'string' ? body.action : ''
  const email = String(body?.email ?? '').trim().toLowerCase()
  const service = createServiceClient()

  try {
    switch (action) {
      // ── send_code ─────────────────────────────────────────────────────────
      // Admin-initiated only. This is the one action that reaches a real person, so
      // it verifies the code is live BEFORE mailing, and stamps only after the send
      // actually succeeded — a row marked "invited" for an email that never left
      // would drop that person out of the queue permanently and silently.
      case 'send_code': {
        const code = String(body?.code ?? '').trim()
        if (!email || !code) return NextResponse.json({ error: 'Email and code are required.' }, { status: 400 })

        const { data: row } = await service
          .from('subscribers').select('email, source').eq('email', email).maybeSingle()
        if (!row) return NextResponse.json({ error: 'That address is not on the waitlist.' }, { status: 404 })
        // The card already hides the button for these; this is the actual boundary.
        if (!isAccessRequest(row)) {
          return NextResponse.json({ error: `${email} signed up for the blog, not for access — sending a code would answer a question they never asked.` }, { status: 400 })
        }

        const { data: codeRow } = await service
          .from('access_codes').select('code, active, uses, max_uses').eq('code', code).maybeSingle()
        if (!codeRow?.active) return NextResponse.json({ error: 'That code is not active.' }, { status: 400 })
        if (codeRow.max_uses != null && (codeRow.uses ?? 0) >= codeRow.max_uses) {
          return NextResponse.json({ error: 'That code is exhausted — raise its limit or create a new one.' }, { status: 400 })
        }

        // Prove we CAN record the send before sending. Stamping is what removes them
        // from the queue; an email that goes out unrecorded means they sit here
        // forever and get invited again on the next pass.
        const probe = await service.from('subscribers').select('invited_at').limit(1)
        if (probe.error) {
          console.error('[admin/waitlist] refusing to send — cannot record it:', probe.error.message)
          return NextResponse.json({ error: 'Migration 066 is not applied yet, so the send cannot be recorded. Nothing was sent.' }, { status: 503 })
        }

        const sent = await sendWaitlistCode({ to: email, code })
        if (!sent) {
          console.error('[admin/waitlist] code email FAILED for', email)
          return NextResponse.json({ error: 'The email did not send — nothing was recorded, so they stay in the queue.' }, { status: 502 })
        }

        const { error } = await service
          .from('subscribers')
          .update({ invited_at: new Date().toISOString(), invited_code: code, dismissed_at: null })
          .eq('email', email)
        if (error) {
          // The person HAS the code; only our bookkeeping failed. Say exactly that —
          // reporting a clean failure would invite a duplicate send.
          console.error('[admin/waitlist] sent but not stamped for', email, error.message)
          return NextResponse.json({ error: `Code sent to ${email}, but recording it failed — do NOT resend.` }, { status: 500 })
        }
        break
      }

      // ── forget ────────────────────────────────────────────────────────────
      // Honour "we delete it sooner if you ask us to" — a sentence now PUBLISHED in
      // the privacy policy. Before this, the only implementation was Robert running
      // SQL by hand, which is the shape of promise that quietly stops being kept.
      //
      // Distinct from `dismiss` on purpose. Dismiss is OUR judgement (spam, not a
      // fit) and keeps the row for 90 days so the address doesn't silently re-enter
      // the queue. This is THEIR request, so it deletes now and keeps nothing —
      // retaining a suppression record of someone who asked to be forgotten would
      // defeat the request. If they later resubmit the form, that is their choice
      // and the row comes back.
      case 'forget': {
        if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
        const { purged, error: purgeErr } = await purgeSubscriberEmail(service, email)
        if (purgeErr) return NextResponse.json({ error: purgeErr }, { status: 500 })
        if (!purged) return NextResponse.json({ error: 'That address is not on the waitlist.' }, { status: 404 })
        console.log('[admin/waitlist] forget (deletion request) honoured')
        break
      }

      // ── dismiss / restore ─────────────────────────────────────────────────
      // Our judgement, not theirs: the row is KEPT so the address doesn't re-enter
      // the queue on the next form submit with no memory of having been judged.
      // Retention then expires it 90 days after the dismissal (lib/subscriberRetention).
      // For a person who ASKS to be removed, use `forget` above — that deletes now.
      case 'dismiss':
      case 'restore': {
        if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
        const { error } = await service
          .from('subscribers')
          .update({ dismissed_at: action === 'dismiss' ? new Date().toISOString() : null })
          .eq('email', email)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        break
      }

      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }

    // Re-paint from authoritative state, never from what the client assumed.
    return NextResponse.json(await loadState(service))
  } catch (e) {
    console.error('[admin/waitlist] action failed:', e?.message ?? e)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
