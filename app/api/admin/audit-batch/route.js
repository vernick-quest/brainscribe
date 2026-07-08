import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { auditTranscript } from '@/lib/auditTranscript'
import { NextResponse, after } from 'next/server'

// POST /api/admin/audit-batch — sample N completed, never-audited transcripts and
// run the coach guardrail auditor over each (brainscribe-transcript-audit).
//
// Admin-only (same gate as set-role). The sampling + a run-ledger row are created
// synchronously; the model calls run in after() so the request returns fast. The
// cron endpoint reuses runAuditBatch() with triggered_by:'cron'.
const DEFAULT_COUNT = 10
const MAX_COUNT = 25

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let count = DEFAULT_COUNT
  try {
    const body = await request.json().catch(() => ({}))
    if (Number.isFinite(body?.count)) count = Math.max(1, Math.min(MAX_COUNT, Math.floor(body.count)))
  } catch {}

  const started = await startAuditBatch({ count, triggeredBy: 'admin', triggeredByUser: user.id })
  if (started.error) return NextResponse.json({ error: started.error }, { status: started.status ?? 500 })

  // Run the model calls after the response flushes.
  after(async () => { await runAuditBatch(started) })

  return NextResponse.json({ runId: started.runId, sampled: started.sessions.length })
}

// Demo/synthetic fixtures the auditor must never sample or flag: the seed-demo
// student ("Demo Student — Mia R.") and its two staged sessions are marketing
// props, not real coaching. The seeder (app/api/admin/seed-demo) marks those
// sessions with severity='none' skip-findings so the NOT-EXISTS sampler already
// excludes them — but we ALSO filter by the demo account here, belt-and-suspenders,
// so a demo session seeded before that bookkeeping existed (or restored from a DB
// dump) can never slip into a nightly batch. Code-side only (no migration).
export const DEMO_STUDENT_EMAIL = 'demo-student@brainscribe.io'

async function demoStudentIds(service) {
  const { data } = await service
    .from('profiles').select('id').eq('email', DEMO_STUDENT_EMAIL)
  return new Set((data ?? []).map(p => p.id))
}

// Sample sessions + open a run-ledger row. Returns { runId, sessions, error? }.
// Shared by the admin route and the cron route.
export async function startAuditBatch({ count, triggeredBy, triggeredByUser = null }) {
  const service = createServiceClient()

  const { data: sampled, error: sampleErr } = await service
    .rpc('sample_unaudited_sessions', { sample_size: count })
  if (sampleErr) {
    console.error('[audit-batch] sample error:', sampleErr.message)
    return { error: sampleErr.message, status: 500 }
  }

  // Drop demo/synthetic sessions defensively (see DEMO_STUDENT_EMAIL note).
  const demoIds = await demoStudentIds(service)
  const sessions = (sampled ?? []).filter(s => !demoIds.has(s.student_id))

  const { data: run, error: runErr } = await service
    .from('transcript_audit_runs')
    .insert({
      triggered_by: triggeredBy,
      triggered_by_user: triggeredByUser,
      requested_count: count,
      status: 'running',
    })
    .select('id')
    .single()
  if (runErr) {
    console.error('[audit-batch] run insert error:', runErr.message)
    return { error: runErr.message, status: 500 }
  }

  return { runId: run.id, sessions: sessions ?? [] }
}

// Execute the audit for a prepared batch and finalize the run row. Idempotent per
// session via the findings unique index. Never throws — records status='error'.
export async function runAuditBatch({ runId, sessions }) {
  const service = createServiceClient()
  let audited = 0
  let findings = 0
  try {
    // Resolve student names once (for name-stripping before the model call).
    const studentIds = [...new Set((sessions ?? []).map(s => s.student_id).filter(Boolean))]
    const nameById = {}
    if (studentIds.length) {
      const { data: profs } = await service
        .from('profiles').select('id, full_name').in('id', studentIds)
      for (const p of profs ?? []) nameById[p.id] = p.full_name
    }

    for (const session of sessions ?? []) {
      const { data: messages } = await service
        .from('messages')
        .select('role, content, created_at')
        .eq('session_id', session.id)
        .order('created_at')

      const result = await auditTranscript({
        runId,
        session,
        messages: messages ?? [],
        studentName: nameById[session.student_id] ?? '',
      })
      if (result) {
        audited++
        if (result.severity && result.severity !== 'none') findings++
      }
    }

    await service.from('transcript_audit_runs').update({
      audited_count: audited,
      findings_count: findings,
      status: 'complete',
      completed_at: new Date().toISOString(),
    }).eq('id', runId)
  } catch (e) {
    console.error('[audit-batch] run failed:', e)
    await service.from('transcript_audit_runs').update({
      audited_count: audited,
      findings_count: findings,
      status: 'error',
      error: String(e?.message ?? e).slice(0, 500),
      completed_at: new Date().toISOString(),
    }).eq('id', runId)
  }
}
