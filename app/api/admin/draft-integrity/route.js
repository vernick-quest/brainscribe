import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { reconcileCommitments } from '@/lib/coachCommitments'
import { checkDraftIntegrity } from '@/lib/draftIntegrity'
import { applyReviews, signalFingerprint, REVIEW_STATUSES } from '@/lib/draftIntegrityReview'
import { isDemoEmail } from '@/lib/demoAccounts'

// GET /api/admin/draft-integrity — sessions where the student's Final Draft may be
// missing work they actually did. Admin-only.
//
// Exists because the 2026-07-20 data loss was completely silent: the coach counted 185
// words, the saved draft held 74, and nothing anywhere logged a problem. A parent found
// it by reading the finished essay. This turns that class of failure into something the
// admin panel surfaces on its own.
//
// See lib/draftIntegrity.js for the two signals and why one alone is not enough.

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 }
  return { user }
}

export async function GET(request) {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500)
  const showResolved = url.searchParams.get('showResolved') === '1'
  const service = createServiceClient()

  // Exclude seeded demo sessions AT THE SOURCE — they are not real student work and
  // must never be flagged (two of the five standing alerts were "Demo Student — Mia
  // R."). Resolve the demo profile ids FIRST and exclude them in the query, so demo
  // sessions never consume slots in the `limit` window (the seeder refreshes them, so
  // they sort to the top and would push real sessions out of coverage). Keyed on the
  // seeder-owned demo emails (durable identity), never the display name — see
  // lib/demoAccounts.js. A null/absent profile is treated as REAL and kept: this
  // filter must never err toward dropping a genuine student.
  const { data: demoProfiles } = await service.from('profiles').select('id').in('email', DEMO_EMAILS)
  const demoIds = (demoProfiles ?? []).map(p => p.id)

  let query = service
    .from('sessions')
    .select('id, student_id, status, is_onboarding, created_at, completed_at, assignment_text, requirements, profiles(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (demoIds.length) query = query.not('student_id', 'in', `(${demoIds.join(',')})`)

  const { data: rawSessions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Belt-and-braces: also drop by email, so a demo session still gets excluded if the
  // id lookup came back empty for any reason.
  const sessions = (rawSessions ?? []).filter(s => !isDemoEmail(s.profiles?.email))
  if (!sessions.length) return NextResponse.json({ flagged: [], checked: 0, alerts: 0, warnings: 0, hiddenResolved: 0 })

  const ids = sessions.map(s => s.id)

  // Two bulk reads rather than 2N per-session queries — this runs on an admin page load.
  const bulkReads = await Promise.all([
    service.from('paragraphs').select('session_id, position, scribed_text').in('session_id', ids).order('position'),
    service.from('paragraph_scaffolds').select('session_id, components, current_paragraph_index').in('session_id', ids),
    // The student's own verdict. This outranks every heuristic below: a student saying
    // their work is missing IS the ground truth, and it catches losses no automated
    // check can see.
    service.from('draft_feedback').select('session_id, matches, note, source, created_at, updated_at').in('session_id', ids),
    // What the coach PROMISED it saved, recorded server-side from the raw stream. The
    // only signal here that proves loss rather than inferring it.
    service.from('coach_commitments').select('session_id, component_id').in('session_id', ids),
    // Sessions already repaired — their old scaffold slots stay empty by design, so a
    // restore must not manufacture permanent broken promises.
    service.from('draft_restorations').select('session_id, restored_at').in('session_id', ids),
    // Message counts, to tell an abandoned session from one that genuinely lost its shape.
    service.from('messages').select('session_id').in('session_id', ids),
  ])

  // A failed read here used to be swallowed: the map would come back empty and the
  // panel would render a confident "no open alerts" built on data it never loaded.
  // A monitor that goes quiet because its query broke is worse than no monitor —
  // fail loudly instead of reporting all-clear from a partial read.
  const READ_NAMES = ['paragraphs', 'paragraph_scaffolds', 'draft_feedback', 'coach_commitments', 'draft_restorations', 'messages']
  const failedRead = bulkReads.findIndex(r => r?.error)
  if (failedRead !== -1) {
    const msg = bulkReads[failedRead].error.message
    console.error(`[draft-integrity] ${READ_NAMES[failedRead]} read failed:`, msg)
    return NextResponse.json({ error: `Integrity check could not read ${READ_NAMES[failedRead]}: ${msg}` }, { status: 500 })
  }

  const [{ data: allParas }, { data: allScaffolds }, { data: allFeedback }, { data: allCommitments }, { data: allRestorations }, { data: allMessages }] = bulkReads
  // A session can hold TWO student reports — one 'in_session', one 'transcript'
  // (migration 053 replaced unique(session_id) with unique(session_id, source)).
  // Keying by session_id alone let an arbitrary row win, so a later "looks fine"
  // could shadow an earlier "my work is missing" and the report would never alert.
  // A matches=false report ALWAYS wins: the student saying work is missing is
  // ground truth and must outrank their own optimistic tap at the end.
  const feedbackBySession = new Map()
  for (const f of allFeedback ?? []) {
    const prev = feedbackBySession.get(f.session_id)
    if (!prev || (prev.matches !== false && f.matches === false)) feedbackBySession.set(f.session_id, f)
  }
  const commitmentsBySession = new Map()
  for (const c of allCommitments ?? []) {
    if (!commitmentsBySession.has(c.session_id)) commitmentsBySession.set(c.session_id, [])
    commitmentsBySession.get(c.session_id).push(c)
  }
  const restoredSessions = new Set((allRestorations ?? []).map(r => r.session_id))
  const restoredAt = new Map((allRestorations ?? []).map(r => [r.session_id, r.restored_at]))

  const parasBySession = new Map()
  for (const p of allParas ?? []) {
    if (!parasBySession.has(p.session_id)) parasBySession.set(p.session_id, [])
    parasBySession.get(p.session_id).push(p)
  }
  const scaffoldBySession = new Map((allScaffolds ?? []).map(s => [s.session_id, s]))

  // A couple of turns is someone looking around, not a session that lost its structure.
  const MIN_MESSAGES_FOR_SCAFFOLD = 8
  const messageCounts = new Map()
  for (const m of allMessages ?? []) {
    messageCounts.set(m.session_id, (messageCounts.get(m.session_id) ?? 0) + 1)
  }

  // Resolve the student's own report ONCE, before the scaffold branch. It used to be
  // read below it, so a scaffold-less session — which `continue`s out early — could
  // never see it: the flag carried no studentReportedMissing, its triage fingerprint
  // was identical before and after the report, and a 'resolved' verdict kept hiding a
  // session whose student was actively saying work was missing. That is the exact
  // invisible-failure class this panel exists to prevent, on the very population
  // (scaffold-less sessions) the backstop was added for.
  //
  // A report describes a moment, not a permanent state: once the draft has been
  // REPAIRED after the student's LATEST answer, the report has been answered and must
  // stop alerting. Compare against updated_at, not created_at — a re-report is an
  // UPSERT that only moves updated_at, so created_at would leave a student who reports
  // AGAIN after an incomplete repair permanently marked "already addressed".
  function studentReportFor(sessionId) {
    const feedback = feedbackBySession.get(sessionId)
    const repairedAt = restoredAt.get(sessionId)
    const reportedAt = feedback?.updated_at ?? feedback?.created_at
    const reportAddressed = Boolean(repairedAt && reportedAt && new Date(repairedAt) >= new Date(reportedAt))
    return { feedback, reported: feedback?.matches === false && !reportAddressed }
  }

  const flagged = []
  for (const s of sessions) {
    const scaffold = scaffoldBySession.get(s.id)
    const { feedback, reported: studentReported } = studentReportFor(s.id)

    // A session with NO scaffold used to be skipped in silence — "nothing to compare
    // against". That is exactly backwards: every signal below reads
    // paragraph_scaffolds.components, so a session without one is INVISIBLE to all of them.
    // 9 of 27 completed sessions were in that state, including a haiku with 69 messages and
    // a narrative with 56. Invisible is the worst thing a safety net can be.
    //
    // The onboarding warm-up legitimately has no scaffold (hook-only), and a session
    // abandoned after a couple of turns never got far enough to have one — so neither is a
    // fault. A LONG completed session with no structure is.
    if (!scaffold) {
      const msgCount = messageCounts.get(s.id) ?? 0
      // A student report is an alert on its own — including here, where there is no
      // scaffold to check against.
      if ((s.status === 'complete' && !s.is_onboarding && msgCount >= MIN_MESSAGES_FOR_SCAFFOLD) || studentReported) {
        const paras = parasBySession.get(s.id) ?? []
        flagged.push({
          sessionId: s.id,
          studentName: s.profiles?.full_name ?? null,
          studentId: s.student_id,
          status: s.status,
          createdAt: s.created_at,
          completedAt: s.completed_at ?? null,
          assignmentPreview: String(s.assignment_text || '').replace(/\s+/g, ' ').slice(0, 90),
          // Carried so the triage fingerprint MOVES when the student speaks up —
          // otherwise a prior 'resolved' verdict would keep hiding this session.
          studentReportedMissing: studentReported,
          studentNote: feedback?.note ?? null,
          studentConfirmedOk: feedback?.matches === true,
          severity: studentReported ? 'alert' : 'warn',
          reasons: [
            ...(studentReported
              ? [`THE STUDENT REPORTED WORK MISSING${feedback.note ? `: "${feedback.note}"` : ''}`]
              : []),
            `finished after ${msgCount} messages with NO scaffold at all — nothing here is ` +
            `structured, so every other integrity check is blind to this session`,
          ],
          finalWords: paras.reduce((n, p) => n + String(p.scribed_text || '').trim().split(/\s+/).filter(Boolean).length, 0),
          workingWords: 0, orphanedWords: 0,
          orphanedComponents: [], unfilledComponents: [], droppedComponents: [],
          brokenCommitments: [], renderedFromParagraphs: paras.length > 0,
          cursorOutOfRange: false, targetWords: null, shortfallPct: null,
          noScaffold: true,
        })
      }
      continue
    }

    const target = s.requirements?.targets?.find(t => t.type === 'words')
    const { broken: brokenCommitments } = reconcileCommitments(
      commitmentsBySession.get(s.id) ?? [],
      scaffold.components ?? [],
      { restored: restoredSessions.has(s.id) },
    )
    const result = checkDraftIntegrity(
      parasBySession.get(s.id) ?? [],
      scaffold.components ?? [],
      {
        currentParagraphIndex: scaffold.current_paragraph_index ?? null,
        status: s.status,
        targetWords: target?.min ?? target?.target ?? target?.max ?? null,
        brokenCommitments,
      }
    )
    // A student saying "something's missing" is ground truth, not a heuristic — it is
    // always an alert, even when every automated signal looks clean. (Resolved above
    // the scaffold branch by studentReportFor, so BOTH paths see it.)
    if (result.ok && !studentReported) continue

    if (studentReported) {
      result.severity = 'alert'
      result.reasons = [
        `THE STUDENT REPORTED WORK MISSING${feedback.note ? `: "${feedback.note}"` : ''}`,
        ...result.reasons,
      ]
    }

    flagged.push({
      studentReportedMissing: studentReported,
      studentNote: feedback?.note ?? null,
      studentConfirmedOk: feedback?.matches === true,
      sessionId: s.id,
      studentName: s.profiles?.full_name ?? null,
      studentId: s.student_id,
      status: s.status,
      createdAt: s.created_at,
      // The card labels this timestamp with the session status, so a complete session
      // must show when it COMPLETED — created_at read as "completed 7d ago" and misled.
      completedAt: s.completed_at ?? null,
      // Enough to recognise the assignment, never the student's own prose.
      assignmentPreview: String(s.assignment_text || '').replace(/\s+/g, ' ').slice(0, 90),
      ...result,
    })
  }

  // Worst first: alerts before warnings, then by how much appears to be missing.
  const rank = { alert: 0, warn: 1, none: 2 }
  flagged.sort((a, b) =>
    rank[a.severity] - rank[b.severity] ||
    b.orphanedWords - a.orphanedWords ||
    (b.shortfallPct ?? 0) - (a.shortfallPct ?? 0)
  )

  // Standing admin verdicts. resolved/not_relevant drop out of the default view —
  // but only while the signal they were made against still holds (applyReviews
  // resurfaces a stale verdict). Reviewer names are resolved for display.
  const { data: reviewRows } = await service
    .from('draft_integrity_reviews')
    .select('session_id, status, note, signal, reviewed_by, reviewed_at')
    .in('session_id', flagged.map(f => f.sessionId))
  const reviewerIds = [...new Set((reviewRows ?? []).map(r => r.reviewed_by).filter(Boolean))]
  const reviewerNames = new Map()
  if (reviewerIds.length) {
    const { data: reviewers } = await service.from('profiles').select('id, full_name').in('id', reviewerIds)
    for (const p of reviewers ?? []) reviewerNames.set(p.id, p.full_name)
  }
  const reviews = (reviewRows ?? []).map(r => ({ ...r, reviewedByName: reviewerNames.get(r.reviewed_by) ?? null }))

  const { flagged: visible, hiddenResolved } = applyReviews(flagged, reviews, { showResolved })

  // Counts describe OPEN work only. With showResolved=1 the list also carries settled
  // verdicts, and counting those would light the red "may be missing student work"
  // banner over a fully-triaged board.
  const open = visible.filter(f => !(f.review && (f.review.status === 'resolved' || f.review.status === 'not_relevant') && !f.review.signalChanged))

  return NextResponse.json({
    flagged: visible,
    checked: sessions.length,
    alerts: open.filter(f => f.severity === 'alert').length,
    warnings: open.filter(f => f.severity === 'warn').length,
    hiddenResolved,
    showResolved,
  })
}

// PATCH /api/admin/draft-integrity — record (or update) the standing admin verdict
// for one flagged session. Service-role UPSERT (RLS has no client policies); admin
// gate above. Body: { sessionId, status, note?, signal }. `signal` is the alert
// fingerprint the admin is acting on (echoed from the GET payload) — stored so a
// later signal change resurfaces the verdict. We assert on the RETURNED ROW's
// values, never the status code: a PostgREST write that matched nothing returns a
// success status with no row.
export async function PATCH(request) {
  const gate = await requireAdmin()
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body
  try { body = await request.json() } catch { body = null }
  const sessionId = body?.sessionId
  const status = body?.status
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : null
  const signal = typeof body?.signal === 'string' ? body.signal : ''

  if (!sessionId || !REVIEW_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'sessionId and a valid status are required' }, { status: 400 })
  }
  if (!signal) {
    // The verdict is meaningless without the signal it was made against — refuse
    // rather than store one that can never detect a later change.
    return NextResponse.json({ error: 'signal is required (the alert state being reviewed)' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('draft_integrity_reviews')
    .upsert(
      { session_id: sessionId, status, note, signal, reviewed_by: gate.user.id, reviewed_at: new Date().toISOString() },
      { onConflict: 'session_id' },
    )
    .select('session_id, status, note, signal, reviewed_at')
    .single()

  // Assert on the VALUE: prove the row landed with the intended status, don't infer
  // success from the absence of an error.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.session_id !== sessionId || data.status !== status) {
    return NextResponse.json({ error: 'Verdict did not persist' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, review: data })
}
