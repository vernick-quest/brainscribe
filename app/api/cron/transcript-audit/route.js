import { startAuditBatch, runAuditBatch } from '@/app/api/admin/audit-batch/route'
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

  const started = await startAuditBatch({ count: DAILY_COUNT, triggeredBy: 'cron' })
  if (started.error) {
    return NextResponse.json({ error: started.error }, { status: started.status ?? 500 })
  }

  after(async () => { await runAuditBatch(started) })

  return NextResponse.json({ runId: started.runId, sampled: started.sessions.length })
}
