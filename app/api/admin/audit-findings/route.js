import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

// GET  /api/admin/audit-findings — non-clean findings + recent run summaries.
// PATCH /api/admin/audit-findings — resolve / re-open a finding, save admin notes.
// Admin-only. The client hydrates session/student display data from props it
// already holds, so this returns raw findings rows only.

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

  // Findings worth surfacing (clean severity='none' rows are ledger-only).
  const { data: findings, error } = await service
    .from('transcript_audit_findings')
    .select('id, run_id, session_id, student_id, persona, severity, breach_types, auditor_analysis, resolved, resolved_at, admin_notes, created_at')
    .neq('severity', 'none')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: runs } = await service
    .from('transcript_audit_runs')
    .select('id, triggered_by, requested_count, audited_count, findings_count, status, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(20)

  // Per-breach verdicts (migration 060), shaped as { findingId: { breachKey: {...} } }.
  // A session routinely holds several distinct breaches and each carries its own note
  // and resolution. Fail-soft: if 060 isn't applied yet the panel still renders, just
  // without per-breach state — a missing table must not blank the whole Audit tab.
  const breachReviews = {}
  if (findings?.length) {
    const { data: rows, error: brErr } = await service
      .from('audit_breach_reviews')
      .select('finding_id, breach_key, resolved, note, reviewed_by, reviewed_at')
      .in('finding_id', findings.map(f => f.id))
    if (brErr) {
      console.warn('[audit-findings] per-breach reviews unavailable (migration 060 not applied?):', brErr.message)
    } else {
      for (const r of rows ?? []) {
        (breachReviews[r.finding_id] ??= {})[r.breach_key] = {
          resolved: r.resolved === true,
          note: r.note ?? '',
          reviewedAt: r.reviewed_at ?? null,
        }
      }
    }
  }

  return NextResponse.json({ findings: findings ?? [], runs: runs ?? [], breachReviews })
}

export async function PATCH(request) {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = await request.json().catch(() => ({}))
  const { id, resolved, admin_notes, breachKey } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const service0 = createServiceClient()

  // ── Per-breach verdict (migration 060) ──────────────────────────────────────
  // When a breachKey is supplied the write targets ONE error inside the finding,
  // not the whole session. Asserts on the RETURNED ROW's values rather than the
  // status code: PostgREST answers a write that matched nothing with success.
  if (typeof breachKey === 'string' && breachKey) {
    const row = { finding_id: id, breach_key: breachKey, reviewed_by: gate.user.id, reviewed_at: new Date().toISOString() }
    if (typeof resolved === 'boolean') row.resolved = resolved
    if (typeof admin_notes === 'string') row.note = admin_notes.slice(0, 2000)

    const { data, error } = await service0
      .from('audit_breach_reviews')
      .upsert(row, { onConflict: 'finding_id,breach_key' })
      .select('finding_id, breach_key, resolved, note, reviewed_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.finding_id !== id || data.breach_key !== breachKey) {
      return NextResponse.json({ error: 'Breach verdict did not persist' }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      breachReview: { resolved: data.resolved === true, note: data.note ?? '', reviewedAt: data.reviewed_at ?? null },
    })
  }

  const patch = {}
  if (typeof resolved === 'boolean') {
    patch.resolved = resolved
    patch.resolved_by = resolved ? gate.user.id : null
    patch.resolved_at = resolved ? new Date().toISOString() : null
  }
  if (typeof admin_notes === 'string') patch.admin_notes = admin_notes.slice(0, 2000)
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('transcript_audit_findings').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
