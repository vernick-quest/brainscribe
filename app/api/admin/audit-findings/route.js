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

  return NextResponse.json({ findings: findings ?? [], runs: runs ?? [] })
}

export async function PATCH(request) {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = await request.json().catch(() => ({}))
  const { id, resolved, admin_notes } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

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
