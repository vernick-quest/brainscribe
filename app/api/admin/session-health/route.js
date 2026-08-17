import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { runSessionHealthPass } from '@/lib/runSessionHealth'

// GET   /api/admin/session-health — open "student work at risk" findings.
// POST  /api/admin/session-health — re-run the pass now (it's free: no model calls).
// PATCH /api/admin/session-health — acknowledge one finding / save a note.
//
// Separate from the guardrail-audit routes on purpose. These findings answer "did the
// student's work survive", not "was the coaching good", and they must not be triageable
// away with the same shrug.

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 }
  return { user }
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const service = createServiceClient()
  const { data, error } = await service
    .from('session_health_findings')
    .select('session_id, signal, severity, detail, pre_existing, first_seen_at, last_seen_at, acknowledged, acknowledged_at, note')
    .order('severity')
    .order('last_seen_at', { ascending: false })
    .limit(500)

  // Fail-soft only for a missing table (migration 069 not applied yet) — any other
  // error is real and must be surfaced rather than rendering a false all-clear.
  if (error) {
    const missing = /relation .* does not exist|schema cache/i.test(error.message)
    if (missing) return NextResponse.json({ findings: [], pending: true, error: null })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ findings: data ?? [], pending: false })
}

export async function POST() {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const result = await runSessionHealthPass()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: e?.message ?? 'Health pass failed' }, { status: 500 })
  }
}

export async function PATCH(request) {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = await request.json().catch(() => ({}))
  const { sessionId, signal, acknowledged, note } = body
  if (!sessionId || !signal) {
    return NextResponse.json({ error: 'sessionId and signal are required' }, { status: 400 })
  }

  const patch = {}
  if (typeof acknowledged === 'boolean') {
    patch.acknowledged = acknowledged
    patch.acknowledged_by = acknowledged ? gate.user.id : null
    patch.acknowledged_at = acknowledged ? new Date().toISOString() : null
  }
  if (typeof note === 'string') patch.note = note.slice(0, 2000)
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('session_health_findings')
    .update(patch)
    .eq('session_id', sessionId).eq('signal', signal)
    .select('session_id, signal, acknowledged, note')
    .single()

  // Assert on the RETURNED ROW: a PATCH that matched zero rows answers 204, which reads
  // exactly like success.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.session_id !== sessionId || data.signal !== signal) {
    return NextResponse.json({ error: 'Finding did not update' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, finding: data })
}
