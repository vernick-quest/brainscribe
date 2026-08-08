import { createClient } from '@/lib/supabase/server'
import { analyzeWriting } from '@/lib/analyzeWriting'
import { COACH_GATE_COLUMNS, coachGateFailure } from '@/lib/access'
import { NextResponse } from 'next/server'

// POST /api/sessions/[id]/analyze-writing
// Runs writing analysis on the given session's essay.
// Can be called manually (e.g. re-analysis) or automatically after completion.
// Only the owning student, a linked teacher, or admin can trigger this.
export async function POST(request, { params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Coach reachability gate (lib/access.js) — this runs a Haiku writing-analysis call,
  // so an unconsented under-13 OR an authed user with no Beta access must not reach it.
  // Enforces BOTH COPPA and access_granted; fails CLOSED. (Session access is still
  // RLS-scoped below.)
  const { data: gate } = await supabase
    .from('profiles')
    .select(COACH_GATE_COLUMNS)
    .eq('id', user.id)
    .single()
  const gateFail = coachGateFailure(gate)
  if (gateFail) return gateFail

  // Fetch session — RLS enforces access
  const { data: session } = await supabase
    .from('sessions')
    .select('id, student_id, assignment_text, status')
    .eq('id', id)
    .single()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch paragraphs
  const { data: paragraphs } = await supabase
    .from('paragraphs')
    .select('scribed_text')
    .eq('session_id', id)
    .order('position')

  const essay = paragraphs?.map(p => p.scribed_text).join('\n\n') ?? ''

  const writingProfile = await analyzeWriting({
    sessionId: id,
    essay,
    assignmentText: session.assignment_text,
    userId: user.id,
  })

  if (!writingProfile) {
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }

  return NextResponse.json({ writingProfile })
}
