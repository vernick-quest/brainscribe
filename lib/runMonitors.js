import { createServiceClient } from '@/lib/supabase/service'
import {
  evaluateProvenanceSilence, MONITOR_PROVENANCE, SILENCE_WINDOW_MS, SETTLE_MS,
} from '@/lib/monitorSilence'

export const MONITOR_SESSION_HEALTH = 'session_health'

// Migration 073 is applied BY HAND, so this deploy can land days before the table exists.
// That window has to fail soft — but ONLY for a genuinely absent table.
//
// 🔴 Measured against the live DB, not assumed: supabase-js answers a missing table with
// PostgREST's own `PGRST205` (schema-cache miss), NOT the raw Postgres `42P01` this first
// checked for. Coding to the code Postgres would return meant the pending path never
// matched — the admin route would have 500'd for as long as 073 sat unapplied, and the
// panel that reports dead monitors would itself have been the thing that was dead.
const isMissingTable = err =>
  err?.code === 'PGRST205' || err?.code === '42P01' ||
  /relation .* does not exist|schema cache/i.test(err?.message ?? '')

// Writing a run is best-effort by design: a monitor must never fail the pass it monitors.
// But it is never SILENT about failing — an unrecorded run makes the panel say "stopped",
// and someone chasing a phantom outage needs the real reason in the log.
export async function recordMonitorRun({ monitor, status, detail = {} }) {
  try {
    const { error } = await createServiceClient()
      .from('monitor_runs').insert({ monitor, status, detail })
    if (error) {
      // Table missing = migration 073 is authored but not pasted yet. Expected between
      // deploy and apply; anything else is a real fault.
      const expected = isMissingTable(error)
      console[expected ? 'warn' : 'error'](
        `[monitor] run NOT recorded for ${monitor} (${error.code}): ${error.message}` +
        (expected ? ' — migration 073 not applied yet' : '')
      )
      return { recorded: false, pending: expected, error: error.message }
    }
    return { recorded: true, pending: false }
  } catch (e) {
    console.error(`[monitor] run record threw for ${monitor}:`, e?.message ?? e)
    return { recorded: false, pending: false, error: e?.message ?? String(e) }
  }
}

export async function latestMonitorRuns() {
  const service = createServiceClient()
  // One read, newest first, then take the first row per monitor. Two monitors at ~2
  // rows/day means this window is months deep; a monitor absent from it is one that has
  // not run in months, which the caller renders as "stopped" — correctly.
  const { data, error } = await service.from('monitor_runs')
    .select('monitor, ran_at, status, detail').order('ran_at', { ascending: false }).limit(200)
  if (error) {
    if (isMissingTable(error)) return { runs: {}, pending: true }
    // Do NOT swallow: an empty object here renders as "never run", which is a false alarm
    // in the opposite direction from the one this whole feature exists to prevent.
    throw new Error(`monitor_runs read failed: ${error.message}`)
  }
  const runs = {}
  for (const r of data ?? []) if (!runs[r.monitor]) runs[r.monitor] = r
  return { runs, pending: false }
}

// ── The provenance-silence pass ───────────────────────────────────────────────────────
// Reads the shadow table and its INDEPENDENT witness, decides which of the three answers
// zero rows has today (lib/monitorSilence.js), and records the run.
export async function runProvenanceSilenceCheck({ now = new Date(), windowMs = SILENCE_WINDOW_MS } = {}) {
  const service = createServiceClient()
  const since = new Date(new Date(now).getTime() - windowMs).toISOString()

  const [checksRes, commitsRes, lastCheckRes] = await Promise.all([
    service.from('provenance_checks').select('session_id, created_at').gte('created_at', since),
    // emitted_at, NOT created_at. The column is named differently on this table and a
    // wrong name here returns an ERROR, not an empty set — which is why it is asserted in
    // the read below instead of being allowed to degrade into "no witness, all quiet".
    service.from('coach_commitments').select('session_id, emitted_at').gte('emitted_at', since),
    // Outside the window on purpose: "last recorded 9 days ago" is the sentence that makes
    // an 'unknown' legible, and it cannot come from a windowed read.
    service.from('provenance_checks').select('created_at').order('created_at', { ascending: false }).limit(1),
  ])

  // A failed read would produce zero rows on BOTH sides and evaluate to 'unknown' — a
  // reassuring-direction failure, in a detector built specifically to stop those.
  const failed = [checksRes, commitsRes].find(r => r.error)
  if (failed) throw new Error(`provenance-silence read failed: ${failed.error.message}`)

  const checkTimes = (checksRes.data ?? []).map(r => r.created_at)
  const commitmentTimes = (commitsRes.data ?? []).map(r => r.emitted_at)

  // Observational only (never raises the status) — see lib/monitorSilence.js.
  const settledBefore = new Date(now).getTime() - SETTLE_MS
  const checkedSessions = new Set((checksRes.data ?? []).map(r => r.session_id))
  const darkSessions = new Set(
    (commitsRes.data ?? [])
      .filter(r => new Date(r.emitted_at).getTime() <= settledBefore && !checkedSessions.has(r.session_id))
      .map(r => r.session_id)
  ).size

  const result = evaluateProvenanceSilence({
    now, checkTimes, commitmentTimes, darkSessions, windowMs,
  })
  // "Last recorded 9 days ago" is the sentence that makes an 'unknown' legible, and it can
  // only come from outside the window. A failure of that extra read costs the sentence,
  // never the verdict.
  if (!lastCheckRes.error && lastCheckRes.data?.[0]?.created_at && !result.lastCheckAt) {
    result.lastCheckAt = lastCheckRes.data[0].created_at
  }

  const record = await recordMonitorRun({
    monitor: MONITOR_PROVENANCE,
    status: result.status,
    detail: {
      checks: result.checks, commitments: result.commitments,
      commitmentsAll: result.commitmentsAll, darkSessions: result.darkSessions,
      windowHours: result.windowHours,
      lastCheckAt: result.lastCheckAt, lastCommitmentAt: result.lastCommitmentAt,
    },
  })

  if (result.status === 'alert') {
    console.error(`[monitor] 🔴 ${result.headline} — ${result.detail}`)
  } else {
    console.log(`[monitor] ${MONITOR_PROVENANCE}: ${result.status} — ${result.detail}`)
  }
  return { ...result, ...record }
}
