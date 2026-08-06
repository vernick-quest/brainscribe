import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { reconcileCommitments } from '@/lib/coachCommitments'
import { checkDraftIntegrity } from '@/lib/draftIntegrity'

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

  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 200, 500)
  const service = createServiceClient()

  const { data: sessions, error } = await service
    .from('sessions')
    .select('id, student_id, status, is_onboarding, created_at, completed_at, assignment_text, requirements, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sessions?.length) return NextResponse.json({ flagged: [], checked: 0 })

  const ids = sessions.map(s => s.id)

  // Two bulk reads rather than 2N per-session queries — this runs on an admin page load.
  const [{ data: allParas }, { data: allScaffolds }, { data: allFeedback }, { data: allCommitments }, { data: allRestorations }, { data: allMessages }] = await Promise.all([
    service.from('paragraphs').select('session_id, position, scribed_text').in('session_id', ids).order('position'),
    service.from('paragraph_scaffolds').select('session_id, components, current_paragraph_index').in('session_id', ids),
    // The student's own verdict. This outranks every heuristic below: a student saying
    // their work is missing IS the ground truth, and it catches losses no automated
    // check can see.
    service.from('draft_feedback').select('session_id, matches, note, created_at').in('session_id', ids),
    // What the coach PROMISED it saved, recorded server-side from the raw stream. The
    // only signal here that proves loss rather than inferring it.
    service.from('coach_commitments').select('session_id, component_id').in('session_id', ids),
    // Sessions already repaired — their old scaffold slots stay empty by design, so a
    // restore must not manufacture permanent broken promises.
    service.from('draft_restorations').select('session_id, restored_at').in('session_id', ids),
    // Message counts, to tell an abandoned session from one that genuinely lost its shape.
    service.from('messages').select('session_id').in('session_id', ids),
  ])
  const feedbackBySession = new Map((allFeedback ?? []).map(f => [f.session_id, f]))
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

  const flagged = []
  for (const s of sessions) {
    const scaffold = scaffoldBySession.get(s.id)

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
      if (s.status === 'complete' && !s.is_onboarding && msgCount >= MIN_MESSAGES_FOR_SCAFFOLD) {
        const paras = parasBySession.get(s.id) ?? []
        flagged.push({
          sessionId: s.id,
          studentName: s.profiles?.full_name ?? null,
          studentId: s.student_id,
          status: s.status,
          createdAt: s.created_at,
          completedAt: s.completed_at ?? null,
          assignmentPreview: String(s.assignment_text || '').replace(/\s+/g, ' ').slice(0, 90),
          severity: 'warn',
          reasons: [
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
    // always an alert, even when every automated signal looks clean.
    const feedback = feedbackBySession.get(s.id)
    // A student report is ground truth — but it describes a moment, not a permanent state.
    // Once the draft has been REPAIRED after they reported it, the report has been answered
    // and must stop alerting, or the session it flagged can never leave the screen. Baron's
    // Gratitude Letter sat there fixed-but-flagged for exactly this reason.
    const repairedAt = restoredAt.get(s.id)
    const reportAddressed = Boolean(repairedAt && feedback?.created_at && new Date(repairedAt) >= new Date(feedback.created_at))
    const studentReported = feedback?.matches === false && !reportAddressed
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

  return NextResponse.json({
    flagged,
    checked: sessions.length,
    alerts: flagged.filter(f => f.severity === 'alert').length,
    warnings: flagged.filter(f => f.severity === 'warn').length,
  })
}
