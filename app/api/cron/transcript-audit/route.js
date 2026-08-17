import { startAuditBatch, runAuditBatch } from '@/app/api/admin/audit-batch/route'
import { runSessionHealthPass } from '@/lib/runSessionHealth'
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
// ONE nightly pass, TWO kinds of finding:
//   1. the sampled guardrail audit (model calls) — is the COACHING good?
//   2. the session-health pass (pure queries, no model) — did the student's WORK survive?
// The second exists because Sierra's loss was mechanical and the first is structurally
// blind to it: an audit that reads what the coach SAID cannot see whether locks landed
// or paragraphs exist. Deliberately NOT a second cron — one nightly pass, two outputs.
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

  const started = await startAuditBatch({ count: DAILY_COUNT, triggeredBy: 'cron' })
  if (started.error) {
    // The audit half failing must not discard the health result we already have.
    return NextResponse.json({ error: started.error, health, healthError }, { status: started.status ?? 500 })
  }

  after(async () => { await runAuditBatch(started) })

  return NextResponse.json({ runId: started.runId, sampled: started.sessions.length, health, healthError })
}
