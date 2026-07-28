import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
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
    .select('id, student_id, status, created_at, completed_at, assignment_text, requirements, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sessions?.length) return NextResponse.json({ flagged: [], checked: 0 })

  const ids = sessions.map(s => s.id)

  // Two bulk reads rather than 2N per-session queries — this runs on an admin page load.
  const [{ data: allParas }, { data: allScaffolds }, { data: allFeedback }] = await Promise.all([
    service.from('paragraphs').select('session_id, position, scribed_text').in('session_id', ids).order('position'),
    service.from('paragraph_scaffolds').select('session_id, components, current_paragraph_index').in('session_id', ids),
    // The student's own verdict. This outranks every heuristic below: a student saying
    // their work is missing IS the ground truth, and it catches losses no automated
    // check can see.
    service.from('draft_feedback').select('session_id, matches, note').in('session_id', ids),
  ])
  const feedbackBySession = new Map((allFeedback ?? []).map(f => [f.session_id, f]))

  const parasBySession = new Map()
  for (const p of allParas ?? []) {
    if (!parasBySession.has(p.session_id)) parasBySession.set(p.session_id, [])
    parasBySession.get(p.session_id).push(p)
  }
  const scaffoldBySession = new Map((allScaffolds ?? []).map(s => [s.session_id, s]))

  const flagged = []
  for (const s of sessions) {
    const scaffold = scaffoldBySession.get(s.id)
    // No scaffold means no structured draft to compare against — nothing to say.
    if (!scaffold) continue

    const target = s.requirements?.targets?.find(t => t.type === 'words')
    const result = checkDraftIntegrity(
      parasBySession.get(s.id) ?? [],
      scaffold.components ?? [],
      {
        currentParagraphIndex: scaffold.current_paragraph_index ?? null,
        status: s.status,
        targetWords: target?.min ?? target?.target ?? target?.max ?? null,
      }
    )
    // A student saying "something's missing" is ground truth, not a heuristic — it is
    // always an alert, even when every automated signal looks clean.
    const feedback = feedbackBySession.get(s.id)
    const studentReported = feedback?.matches === false
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
