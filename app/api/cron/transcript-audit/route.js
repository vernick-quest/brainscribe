import { startAuditBatch, runAuditBatch } from '@/app/api/admin/audit-batch/route'
import { runSessionHealthPass } from '@/lib/runSessionHealth'
import { runProvenanceSilenceCheck } from '@/lib/runMonitors'
import { NextResponse, after } from 'next/server'

// GET /api/cron/transcript-audit — daily coach-guardrail audit of a small sample
// of never-audited completed transcripts (brainscribe-transcript-audit). Findings
// surface in the admin "Audit" tab. Coach-only v1.
//
// Protected by CRON_SECRET exactly like coppa-cleanup: Vercel sends
// `Authorization: Bearer <CRON_SECRET>` on cron invocations. FAILS CLOSED — if
// CRON_SECRET isn't set, the route refuses to run (so it can never run
// unprotected). Manual run:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://www.brainscribe.io/api/cron/transcript-audit
//
// ONE nightly pass, THREE kinds of finding:
//   1. the sampled guardrail audit (model calls) — is the COACHING good?
//   2. the session-health pass (pure queries, no model) — did the student's WORK survive?
//   3. the provenance silence check (pure queries) — are the monitors themselves alive?
// (2) exists because Sierra's loss was mechanical and (1) is structurally blind to it: an
// audit that reads what the coach SAID cannot see whether locks landed or paragraphs
// exist. (3) exists because (1) and (2) both report by writing rows, and a monitor that
// has silently stopped writing rows is indistinguishable from a quiet week.
// Deliberately NOT three crons — one nightly pass, three outputs.
//
// Sampling + the run-ledger row are created synchronously; the model calls run in
// after() so the invocation returns fast. Starts conservative (see DAILY_COUNT);
// raise once findings quality is confirmed on real data.
export const maxDuration = 300 // headroom for the after() model calls

const DAILY_COUNT = 8 // 5–10/day per the rollout plan

export async function GET(request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Health pass first and INLINE: it is pure queries over the whole corpus (no model
  // calls, seconds not minutes), and it is the half that catches lost student work, so
  // it must not be able to fail merely because the sampled audit did. Its failure is
  // reported, never swallowed — a health pass that silently no-ops is the same silence
  // that let Sierra's session sit unflagged.
  let health = null, healthError = null
  try {
    health = await runSessionHealthPass()
    console.log('[cron/transcript-audit] session health:', JSON.stringify(health))
  } catch (e) {
    healthError = e?.message ?? String(e)
    console.error('[cron/transcript-audit] session health FAILED:', healthError)
  }

  // The silence check, also inline and also pure queries. It asks whether the provenance
  // shadow monitor still has a pulse — /api/scaffold suppresses recording whenever it
  // cannot trust a score, so a column drift would stop recording for every session with no
  // symptom but zero rows, which is what a quiet day looks like too. Runs AFTER the health
  // pass and independently of it: two monitors must not be able to take each other down.
  let provenance = null, provenanceError = null
  try {
    provenance = await runProvenanceSilenceCheck()
  } catch (e) {
    provenanceError = e?.message ?? String(e)
    console.error('[cron/transcript-audit] provenance silence check FAILED:', provenanceError)
  }

  const started = await startAuditBatch({ count: DAILY_COUNT, triggeredBy: 'cron' })
  if (started.error) {
    // The audit half failing must not discard the health result we already have.
    return NextResponse.json({ error: started.error, health, healthError, provenance, provenanceError }, { status: started.status ?? 500 })
  }

  after(async () => { await runAuditBatch(started) })

  return NextResponse.json({ runId: started.runId, sampled: started.sessions.length, health, healthError, provenance, provenanceError })
}
