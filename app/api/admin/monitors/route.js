import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { latestMonitorRuns, runProvenanceSilenceCheck, MONITOR_SESSION_HEALTH } from '@/lib/runMonitors'
import { MONITOR_PROVENANCE } from '@/lib/monitorSilence'

// GET  /api/admin/monitors — are the background safety passes still running?
// POST /api/admin/monitors — run the provenance silence check now (pure queries, free).
//
// This is the watcher of the watchers. Every other admin panel reports what a pass FOUND;
// this one reports whether the pass is still happening at all, which no findings table can
// answer — findings clear by deletion, so quiet and dead look identical.

// A monitor that should run nightly and last ran two days ago has stopped, whatever its
// last status said. Two nights of grace so one late cron is not an alarm.
const STALE_MS = 48 * 60 * 60 * 1000

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 }
  return { user }
}

const MONITORS = [
  {
    key: MONITOR_SESSION_HEALTH,
    label: 'Session health',
    what: 'Did the student’s work survive — locks that never became a draft, cut-off replies.',
  },
  {
    key: MONITOR_PROVENANCE,
    label: 'Provenance recording',
    what: 'Is the shadow signal still being written, or has it gone dark while locks kept happening.',
  },
]

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let runs = {}, pending = false
  try {
    ({ runs, pending } = await latestMonitorRuns())
  } catch (e) {
    return NextResponse.json({ error: e?.message ?? 'monitor_runs read failed' }, { status: 500 })
  }

  const now = Date.now()
  const monitors = MONITORS.map(m => {
    const run = runs[m.key] ?? null
    const ranAt = run?.ran_at ?? null
    const stale = ranAt ? now - new Date(ranAt).getTime() > STALE_MS : false
    return {
      ...m,
      ranAt,
      // A stopped monitor outranks whatever verdict it last managed to write: 'ok' from
      // three days ago is not an ok, it is a monitor nobody has heard from.
      status: !ranAt ? 'never' : stale ? 'stopped' : (run.status ?? 'unknown'),
      lastStatus: run?.status ?? null,
      detail: run?.detail ?? null,
    }
  })

  return NextResponse.json({ monitors, pending })
}

export async function POST() {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const result = await runProvenanceSilenceCheck()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: e?.message ?? 'Silence check failed' }, { status: 500 })
  }
}
