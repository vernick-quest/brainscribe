import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { reviewRubric, REVIEW_MODEL } from '@/lib/gradeAgainstRubric'
import { recordAnthropicUsage } from '@/lib/usage'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { canUseCoach, coachGateResponse } from '@/lib/coppa'

// POST /api/sessions/[id]/review
// Run the Head Grader against an attached rubric. Owner-only; requires a
// COMPLETE session, an attached rubric, and a real essay (≥30 chars). Gated by
// canUseCoach, 5/day. Persists a versioned envelope into rubrics.feedback_text
// and returns the validated review. No GET — the transcript server component
// reads the rubrics row directly.
export async function POST(request, { params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Owner-only (a watcher can read the session but must not run a review).
  const { data: session } = await supabase
    .from('sessions').select('student_id, status, assignment_text').eq('id', id).single()
  if (!session) return Response.json({ error: 'Not found' }, { status: 404 })
  if (session.student_id !== user.id) {
    return Response.json({ error: 'Only the student who owns this assignment can check their work.' }, { status: 403 })
  }
  if (session.status !== 'complete') {
    return Response.json({ error: 'Finish the assignment before checking it against a rubric.', code: 'not_complete' }, { status: 409 })
  }

  // Rubric must already be attached.
  const { data: rubricRow } = await supabase
    .from('rubrics').select('rubric_text').eq('session_id', id).single()
  if (!rubricRow?.rubric_text?.trim()) {
    return Response.json({ error: 'Attach a rubric first.', code: 'no_rubric' }, { status: 409 })
  }

  // Assemble the essay the same way the transcript renders it: prose from
  // paragraphs, else confirmed scaffold components (haiku lines, etc.).
  const [{ data: paragraphs }, { data: scaffold }] = await Promise.all([
    supabase.from('paragraphs').select('scribed_text').eq('session_id', id).order('position'),
    supabase.from('paragraph_scaffolds').select('components').eq('session_id', id).maybeSingle(),
  ])
  const scaffoldLines = (scaffold?.components ?? [])
    .flatMap(sec => sec.items ?? [])
    .filter(it => it.status === 'confirmed' && (it.text || it.nuggetText))
    .map(it => it.text || it.nuggetText)
  const essay = paragraphs?.length
    ? paragraphs.map(p => p.scribed_text).join('\n\n')
    : scaffoldLines.join('\n')

  if (!essay || essay.trim().length < 30) {
    return Response.json({ error: 'There isn’t enough written yet to check against a rubric.', code: 'essay_too_short' }, { status: 409 })
  }

  // COPPA coach age gate.
  const { data: gate } = await supabase
    .from('profiles').select('role, age_bracket, coppa_consent_required, coppa_consent_given').eq('id', user.id).single()
  if (!canUseCoach(gate)) return coachGateResponse()

  // Denial-of-wallet backstop (fails open) — the Sonnet review is the costly call.
  if (!await checkRateLimit(`review:day:${user.id}`, 5, 86400)) {
    return rateLimited("You've checked your work a few times today — please try again tomorrow.")
  }

  const result = await reviewRubric({
    rubricText: rubricRow.rubric_text,
    essay,
    assignmentText: session.assignment_text,
  })

  if (!result?.review) {
    return Response.json({ error: 'Could not check your work right now. Please try again in a moment.' }, { status: 502 })
  }

  // Log usage + persist the versioned envelope into rubrics.feedback_text (a text
  // column built for exactly this). Service-role write; re-running overwrites. An
  // unparseable feedback_text is treated downstream as "no review".
  await recordAnthropicUsage({
    model: REVIEW_MODEL,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    sessionId: id,
    userId: user.id,
  })

  const envelope = { v: 1, model: REVIEW_MODEL, created_at: new Date().toISOString(), review: result.review }
  const { error: persistErr } = await createServiceClient()
    .from('rubrics').update({ feedback_text: JSON.stringify(envelope) }).eq('session_id', id)
  if (persistErr) console.error('[review] feedback persist error:', persistErr)

  return Response.json({ review: envelope.review, created_at: envelope.created_at })
}
