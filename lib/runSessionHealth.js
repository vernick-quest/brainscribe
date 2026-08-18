import { createServiceClient } from '@/lib/supabase/service'
import { evaluateSessionHealth } from '@/lib/sessionHealth'
import { recordMonitorRun, MONITOR_SESSION_HEALTH } from '@/lib/runMonitors'

// Runs the deterministic session-health pass over every real session and reconciles
// session_health_findings with what is true RIGHT NOW.
//
// Reconcile, not append: because every signal is a query rather than a model call, a
// finding can be re-derived, so one whose condition has been fixed must DISAPPEAR. An
// alert that can never clear is noise, and noise is what taught everyone to stop reading
// the tab in the first place.
//
// No model calls, so this is free to run nightly over the whole corpus.
export async function runSessionHealthPass({ limit = 1000 } = {}) {
  const service = createServiceClient()

  const [sessionsRes, scaffoldsRes, parasRes, msgsRes] = await Promise.all([
    service.from('sessions')
      .select('id, student_id, status, is_onboarding, created_at, truncated_turns, truncated_turns_no_lock')
      .eq('is_onboarding', false)
      .order('created_at', { ascending: false })
      .limit(limit),
    service.from('paragraph_scaffolds').select('session_id, components, created_at'),
    service.from('paragraphs').select('session_id'),
    service.from('messages').select('session_id, role, content, created_at').eq('role', 'user'),
  ])

  // A failed read here would silently produce an all-clear built on data we never
  // loaded — the exact reassuring-direction failure this pass exists to catch.
  const failed = [sessionsRes, scaffoldsRes, parasRes, msgsRes].find(r => r.error)
  if (failed) throw new Error(`session-health read failed: ${failed.error.message}`)

  const scaffoldBySession = new Map((scaffoldsRes.data ?? []).map(s => [s.session_id, s]))
  const paraCount = new Map()
  for (const p of parasRes.data ?? []) paraCount.set(p.session_id, (paraCount.get(p.session_id) ?? 0) + 1)
  const studentMsgs = new Map()
  for (const m of msgsRes.data ?? []) {
    if (!studentMsgs.has(m.session_id)) studentMsgs.set(m.session_id, [])
    studentMsgs.get(m.session_id).push(m)
  }

  const found = []
  for (const s of sessionsRes.data ?? []) {
    const sc = scaffoldBySession.get(s.id)
    const msgs = (studentMsgs.get(s.id) ?? []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const studentChars = msgs.reduce((n, m) => n + String(m.content || '').length, 0)
    const turnsBeforeScaffold = sc?.created_at
      ? msgs.filter(m => new Date(m.created_at) < new Date(sc.created_at)).length
      : null

    for (const f of evaluateSessionHealth({
      session: s,
      components: sc ? sc.components : null,
      paragraphCount: paraCount.get(s.id) ?? 0,
      studentTurns: msgs.length,
      studentChars,
      turnsBeforeScaffold,
    })) {
      found.push({ session_id: s.id, ...f })
    }
  }

  const now = new Date().toISOString()
  let upserted = 0
  if (found.length) {
    // first_seen_at is left to the column default on insert and deliberately NOT sent on
    // update, so "when did this start" survives every subsequent pass.
    const { error } = await service.from('session_health_findings').upsert(
      found.map(f => ({
        session_id: f.session_id,
        signal: f.type,
        severity: f.severity,
        detail: f.detail,
        pre_existing: f.preExisting === true,
        last_seen_at: now,
      })),
      { onConflict: 'session_id,signal' },
    )
    if (error) throw new Error(`session-health upsert failed: ${error.message}`)
    upserted = found.length
  }

  // Clear findings whose condition no longer holds. Scoped to rows this pass could have
  // re-stamped (last_seen_at older than this run), so a row for a session outside the
  // limit window is never deleted just for being out of scope.
  const { data: stale, error: delErr } = await service
    .from('session_health_findings')
    .delete()
    .lt('last_seen_at', now)
    .select('session_id, signal')
  if (delErr) console.error('[session-health] clearing stale findings failed:', delErr.message)

  const bySeverity = found.reduce((m, f) => ({ ...m, [f.severity]: (m[f.severity] ?? 0) + 1 }), {})
  const stats = {
    scanned: sessionsRes.data?.length ?? 0,
    found: upserted,
    cleared: stale?.length ?? 0,
    critical: bySeverity.critical ?? 0,
    high: bySeverity.high ?? 0,
    medium: bySeverity.medium ?? 0,
    preExisting: found.filter(f => f.preExisting).length,
  }

  // Record that the pass RAN (migration 074). The panel used to infer this from the
  // findings table being non-empty, which is unanswerable by construction: findings clear
  // by DELETION — the property that makes this pass trustworthy — so a corpus with nothing
  // wrong is indistinguishable from a pass that never fired, and the day everything is
  // finally fixed the panel would read "Not checked yet" forever.
  //
  // 'ok' means the pass completed, NOT that it found nothing. Findings have their own
  // severity and their own home; conflating "the monitor is alive" with "the corpus is
  // clean" is how a green light ends up meaning two different things.
  await recordMonitorRun({ monitor: MONITOR_SESSION_HEALTH, status: 'ok', detail: stats })

  return stats
}
