import { createClient } from '@/lib/supabase/server'
import { createNotificationsForSession } from '@/lib/notifications'
import { analyzeWriting } from '@/lib/analyzeWriting'
import { assembleParagraphText } from '@/lib/assembleParagraph'
import { persistRequirementsActual } from '@/lib/requirements'
import { recomputeSuggestion } from '@/lib/gymSuggest'
import { NextResponse, after } from 'next/server'

// Build flowing prose for any scaffold paragraph whose components are confirmed but
// that has no paragraphs row yet — e.g. a single-paragraph session that goes
// straight to [COMPLETE], or a final paragraph the student never manually
// assembled. Without this, the "final draft" is just disconnected component lines.
async function assembleUnbuiltParagraphs(supabase, sessionId, userId) {
  const [{ data: scaffold }, { data: existing }] = await Promise.all([
    supabase.from('paragraph_scaffolds').select('components').eq('session_id', sessionId).single(),
    supabase.from('paragraphs').select('position, paragraph_index').eq('session_id', sessionId),
  ])

  const built = new Set((existing ?? []).map(p => p.paragraph_index ?? p.position))
  const toBuild = (scaffold?.components ?? [])
    .map((para, idx) => ({ para, idx }))
    .filter(({ para, idx }) =>
      !built.has(idx) &&
      (para.items ?? []).some(c => c.status === 'confirmed' && (c.text || c.nuggetText))
    )

  await Promise.all(toBuild.map(async ({ para, idx }) => {
    const components = (para.items ?? [])
      .filter(c => c.status === 'confirmed' && (c.text || c.nuggetText))
      .map(c => ({ id: c.id, label: c.label ?? c.id, text: c.text || c.nuggetText }))
    const { assembled, componentText } = await assembleParagraphText({
      components, paragraphType: para.type, sessionId, userId,
    })
    if (!assembled) return
    const { error } = await supabase.from('paragraphs').insert({
      session_id: sessionId,
      scribed_text: assembled,
      raw_spoken_text: componentText,
      position: idx,
      paragraph_index: idx,
      paragraph_type: para.type,
      is_thin: false,
    })
    if (error) console.error('[complete auto-assemble]', error.message)
  }))
}

// PATCH /api/sessions/[id]/complete
// Marks the session complete and notifies any linked teachers.
export async function PATCH(request, { params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: session } = await supabase
    .from('sessions')
    .select('id, student_id, title, assignment_text, status, is_onboarding')
    .eq('id', id)
    .single()

  if (!session || session.student_id !== user.id) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  // Already complete — idempotent, just return ok
  if (session.status === 'complete') {
    return NextResponse.json({ ok: true })
  }

  // Mark complete
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'complete' })
    .eq('id', id)

  if (error) {
    console.error('[sessions complete]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch student name for notification message
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const studentName = studentProfile?.full_name ?? 'Your student'
  const assignmentLabel = session.title
    || session.assignment_text?.slice(0, 60) + (session.assignment_text?.length > 60 ? '…' : '')
    || 'an assignment'

  // Notify all teachers on this session (deferred — a bare floating promise can be
  // killed when the serverless function returns; after() keeps it alive post-response)
  after(() => createNotificationsForSession({
    sessionId: id,
    type: 'assignment_complete',
    message: `${studentName} finished their assignment: "${assignmentLabel}"`,
  }).catch(e => console.error('[notifications complete]', e)))

  // Turn any confirmed-but-unassembled paragraphs into flowing prose before we
  // read the final draft for analysis (and hand it back to the client). Skipped for
  // the onboarding warm-up: it's a single opening line, not a paragraph — running it
  // through assembly would reword the student's exact words. The transcript shows the
  // verbatim line from the scaffold instead.
  if (!session.is_onboarding) {
    await assembleUnbuiltParagraphs(supabase, id, user.id)
  }

  // Final actual-progress snapshot for sessions.requirements (no-op if none set).
  await persistRequirementsActual(supabase, id)

  const { data: paragraphs } = await supabase
    .from('paragraphs')
    .select('scribed_text, is_thin, position, paragraph_index')
    .eq('session_id', id)
    .order('position')

  const essay = paragraphs?.map(p => p.scribed_text).join('\n\n') ?? ''

  // Analyze writing profile (fire-and-forget — takes a few seconds). Skipped for the
  // onboarding warm-up: a single opening line isn't enough signal and shouldn't seed
  // the student's writing profile.
  if (!session.is_onboarding) {
    after(() => analyzeWriting({ sessionId: id, essay, assignmentText: session.assignment_text, userId: user.id })
      // Once the fresh writing profile is saved, recompute the student's gym suggestion
      // (no-op if they don't use the gym — recomputeSuggestion returns null). Provenance
      // stays one-way: the gym reads the assignment profile, never writes to it.
      .then(() => recomputeSuggestion(user.id))
      .catch(e => console.error('[analyzeWriting complete]', e)))
  }

  // Return the assembled paragraphs so the client can show the finished prose
  // in the draft panel without a refetch.
  return NextResponse.json({ ok: true, paragraphs: paragraphs ?? [] })
}
