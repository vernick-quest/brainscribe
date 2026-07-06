import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { logAnthropicUsage } from '@/lib/usage'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { canUseCoach, coachGateResponse } from '@/lib/coppa'

const anthropic = new Anthropic()

const RUBRIC_TEXT_MAX = 10_000 // ~a dense two-page rubric
const MAX_BYTES = 5 * 1024 * 1024

const ALLOWED_TYPES = {
  'image/jpeg':      { kind: 'image', mediaType: 'image/jpeg' },
  'image/jpg':       { kind: 'image', mediaType: 'image/jpeg' },
  'image/png':       { kind: 'image', mediaType: 'image/png' },
  'image/webp':      { kind: 'image', mediaType: 'image/webp' },
  'image/gif':       { kind: 'image', mediaType: 'image/gif' },
  'application/pdf': { kind: 'document', mediaType: 'application/pdf' },
}

// POST /api/sessions/[id]/rubric
// Attach the assignment's REAL rubric to a session so the Head Grader can review
// against it. Two branches:
//   • JSON  { rubricText }  — pasted text (≤ RUBRIC_TEXT_MAX chars)
//   • multipart form-data   — a photo/PDF, OCR'd with a rubric-specific Haiku
//     prompt (same vision mechanics as /api/parse-assignment).
// Owner-only, gated by canUseCoach, 10/day. Attaching clears any stale review
// (rubrics.feedback_text) so a review always reflects the current rubric.
export async function POST(request, { params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Owner-only. RLS on `rubrics` also enforces this on the upsert, but check
  // explicitly for a clean 403 (a watcher can READ the session row, so
  // ownership — not mere readability — is the gate).
  const { data: session } = await supabase
    .from('sessions').select('student_id').eq('id', id).single()
  if (!session) return Response.json({ error: 'Not found' }, { status: 404 })
  if (session.student_id !== user.id) {
    return Response.json({ error: 'Only the student who owns this assignment can attach a rubric.' }, { status: 403 })
  }

  // COPPA coach age gate — the rubric flow is part of the coached experience.
  const { data: gate } = await supabase
    .from('profiles').select('role, age_bracket, coppa_consent_required, coppa_consent_given').eq('id', user.id).single()
  if (!canUseCoach(gate)) return coachGateResponse()

  // Denial-of-wallet backstop (fails open). OCR is the expensive branch; cap
  // both branches under one daily key.
  if (!await checkRateLimit(`rubric:day:${user.id}`, 10, 86400)) {
    return rateLimited("You've attached a lot of rubrics today — please try again tomorrow.")
  }

  const contentType = request.headers.get('content-type') ?? ''
  let rubricText = ''

  if (contentType.includes('multipart/form-data')) {
    // ── Upload branch: OCR a photo/PDF of the rubric ──
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    const typeMeta = ALLOWED_TYPES[file.type]
    if (!typeMeta) {
      return Response.json({ error: 'Unsupported file type. Please upload a JPG, PNG, WebP, GIF, or PDF.' }, { status: 415 })
    }

    const arrayBuffer = await file.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return Response.json({ error: 'File too large. Maximum size is 5 MB (about 1–2 pages).' }, { status: 413 })
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const fileBlock = typeMeta.kind === 'image'
      ? { type: 'image', source: { type: 'base64', media_type: typeMeta.mediaType, data: base64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          fileBlock,
          {
            type: 'text',
            text: `Transcribe the GRADING RUBRIC from this ${typeMeta.kind === 'document' ? 'PDF' : 'image'} as plain text.

The ${typeMeta.kind === 'document' ? 'document' : 'photo'} may be imperfect — a worksheet, a table snapped at an angle, rotated, or poorly lit. If the text is rotated, read it in the orientation it actually runs. Transcribe what is really there; if a part is unreadable, skip it — NEVER guess or invent criteria, levels, or descriptors you cannot actually read.

A rubric usually lists CRITERIA (rows) and, for each, either quality LEVELS with descriptors (e.g. 4/3/2/1, or Exceeds/Meets/Approaching/Beginning) or a single expectation. Preserve ALL of it faithfully:
- every criterion name exactly as written
- every level's name/points and its full descriptor text, kept with its criterion
- any point values, checkboxes, or requirement counts as written

Keep the structure readable (one criterion per block; list each level and its descriptor). Do not summarize, rank, or add commentary — transcribe only.

If there is NO grading rubric visible (e.g. it's just an essay, an assignment prompt with no criteria, or unreadable), reply with exactly: NO_RUBRIC_FOUND`,
          },
        ],
      }],
    })

    logAnthropicUsage({ model: 'claude-haiku-4-5-20251001', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, userId: user.id })

    const extracted = (response.content.find(b => b.type === 'text')?.text ?? '').trim()
    if (!extracted || extracted.startsWith('NO_RUBRIC_FOUND')) {
      return Response.json(
        { error: "Couldn't find a rubric in that file. Try a clearer photo or paste the rubric text directly.", code: 'no_rubric_found' },
        { status: 422 }
      )
    }
    rubricText = extracted.slice(0, RUBRIC_TEXT_MAX)
  } else {
    // ── Paste branch: JSON { rubricText } ──
    let body
    try { body = await request.json() } catch { body = {} }
    rubricText = typeof body?.rubricText === 'string' ? body.rubricText.trim() : ''
    if (!rubricText) {
      return Response.json({ error: 'Paste your rubric text first.' }, { status: 400 })
    }
    if (rubricText.length > RUBRIC_TEXT_MAX) {
      return Response.json({ error: `That rubric is too long (max ${RUBRIC_TEXT_MAX.toLocaleString()} characters).` }, { status: 413 })
    }
  }

  // Upsert the rubric and clear any stale review. session_id is UNIQUE, so a
  // re-attach overwrites in place. RLS ("rubrics: session owner") re-enforces
  // ownership on write.
  const { error: upsertErr } = await supabase
    .from('rubrics')
    .upsert({ session_id: id, rubric_text: rubricText, feedback_text: null }, { onConflict: 'session_id' })

  if (upsertErr) {
    console.error('[rubric attach] upsert error:', upsertErr)
    return Response.json({ error: 'Could not save the rubric. Please try again.' }, { status: 500 })
  }

  return Response.json({ ok: true, rubricText })
}
