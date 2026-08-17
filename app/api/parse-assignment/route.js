import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { logAnthropicUsage } from '@/lib/usage'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { COACH_GATE_COLUMNS, coachGateFailure } from '@/lib/access'
import { assertComplete } from '@/lib/modelResponse'

const anthropic = new Anthropic()

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

const ALLOWED_TYPES = {
  'image/jpeg':       { kind: 'image', mediaType: 'image/jpeg' },
  'image/jpg':        { kind: 'image', mediaType: 'image/jpeg' },
  'image/png':        { kind: 'image', mediaType: 'image/png' },
  'image/webp':       { kind: 'image', mediaType: 'image/webp' },
  'image/gif':        { kind: 'image', mediaType: 'image/gif' },
  'application/pdf':  { kind: 'document', mediaType: 'application/pdf' },
}

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Coach reachability gate (lib/access.js) — assignment OCR is a coach capability
  // (a model call), so an unconsented under-13 OR an authed user with no Beta access
  // must not reach it.
  const { data: gate } = await supabase
    .from('profiles').select(COACH_GATE_COLUMNS).eq('id', user.id).single()
  const gateFail = coachGateFailure(gate)
  if (gateFail) return gateFail

  if (!await checkRateLimit(`parse-assignment:${user.id}`, 10, 60)) return rateLimited()

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || typeof file === 'string') {
    return Response.json({ error: 'No file provided' }, { status: 400 })
  }

  const typeMeta = ALLOWED_TYPES[file.type]
  if (!typeMeta) {
    return Response.json(
      { error: 'Unsupported file type. Please upload a JPG, PNG, WebP, GIF, or PDF.' },
      { status: 415 }
    )
  }

  const arrayBuffer = await file.arrayBuffer()
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return Response.json(
      { error: 'File too large. Maximum size is 5 MB (about 1–2 pages).' },
      { status: 413 }
    )
  }

  const base64 = Buffer.from(arrayBuffer).toString('base64')

  // Build the content block — image vs PDF use different Claude source types
  const fileBlock = typeMeta.kind === 'image'
    ? {
        type: 'image',
        source: { type: 'base64', media_type: typeMeta.mediaType, data: base64 },
      }
    : {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    // 1024 was a silent data-loss ceiling on the INTAKE path, not a cost knob. This call
    // transcribes the student's OWN existing answers verbatim (see the ALREADY WRITTEN BY
    // THE STUDENT section below), and that section is instructed to come LAST — so a cut
    // drops THEIR WORK FIRST and leaves a complete-looking assignment above it. A filled-in
    // worksheet plus a rubric clears 1024 easily. Haiku, billed on actual output.
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: [
        fileBlock,
        {
          type: 'text',
          text: `Extract the writing assignment from this ${typeMeta.kind === 'document' ? 'PDF' : 'image'}.

The ${typeMeta.kind === 'document' ? 'document' : 'photo'} may be imperfect — a handwritten note, a whiteboard, a worksheet snapped at an angle, rotated sideways, blurry, or poorly lit. If the text is rotated, read it in the orientation the text actually runs. Transcribe what is really there; if a part is unreadable, skip it — NEVER guess or invent requirements you cannot actually read. The assignment may also be embedded in a larger page (a newsletter, syllabus, or agenda) — extract just the writing assignment.

Capture everything the student needs to know about WHAT to write and HOW it must be structured — this drives the coaching, so don't lose it:
- the prompt/topic
- the form or format (essay, narrative, haiku, poem, list, lab report, cover letter, etc.)
- the required structure (number of paragraphs, lines, sections, or parts)
- length requirements
- required elements (thesis, evidence, specific sections, syllable counts, rhyme scheme, etc.)
If a rubric or checklist describes structural or content requirements, INCLUDE those — that's often where the format is specified.

LAYOUT: worksheets are often TABLES. Read every cell, including the right-hand column — fields sitting beside each other on the same row are just as important as the ones below. Work through the grid cell by cell rather than reading straight down the page, or you will silently lose half of it.

EVERY FIELD THE STUDENT MUST FILL IN IS PART OF THE ASSIGNMENT — include it even when it looks administrative:
- "Author's Name:", "Book Title:", "Genre:" are things the STUDENT supplies. They are not the class header.
- A rating scale the student marks ("give it 1-5 stars", "circle one") is a question they must answer, not a grading rubric.
- Any blank, line, or box waiting to be completed.
Leave out only what the student never has to write: the teacher's own name, class/period headers, due dates, the points an item is WORTH, and grading-only criteria (e.g. "Grammar — 10 pts"). If you cannot tell whether a field is for the student or the teacher, KEEP IT — a coach can skip something extra, but it cannot ask about a field it never saw.

WORK THE STUDENT HAS ALREADY DONE — this is separate from the assignment and you must NOT throw it away. A student often uploads a worksheet they have partly filled in: handwriting in the blanks, typed answers under the printed prompts, a rating circled. Capture it, because a coach that cannot see it will ask them to redo work they have already finished.

Transcribe their existing answers VERBATIM — their words, their spelling, their phrasing. Never tidy, complete, or improve them. If a field is blank, say nothing about it rather than inventing an answer.

Put anything already written at the END, after everything else, under exactly this heading and nothing else:

ALREADY WRITTEN BY THE STUDENT:
<field label>: <their exact words>
<field label>: <their exact words>

Omit that whole section — heading included — if the page is blank. Everything above the heading is the assignment; everything below it is the student's own draft, and the two must never be mixed.

If no assignment is visible, reply with exactly: NO_ASSIGNMENT_FOUND`,
        },
      ],
    }],
  })

  logAnthropicUsage({ model: 'claude-haiku-4-5-20251001', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, userId: user.id })

  // A truncated extraction is a successful API call carrying a partial worksheet, and the
  // partial LOOKS fine — the assignment reads complete and only the student's own answers
  // are missing off the end. Refuse it and say so, rather than opening a session whose
  // "ALREADY WRITTEN" section silently lost half their work. Raising the ceiling makes
  // this rare; it does not make it impossible, and the failure is invisible without this.
  try {
    assertComplete(response, { what: 'the assignment extraction' })
  } catch (err) {
    if (err.code !== 'model_truncated') throw err
    return Response.json(
      { error: "That worksheet was too long to read in one pass. Try uploading it a page at a time, or paste the assignment text directly." },
      { status: 422 }
    )
  }

  // Find the text block explicitly — content[0] isn't guaranteed to be text on
  // every model (e.g. thinking-enabled models emit a thinking block first).
  const extracted = (response.content.find(b => b.type === 'text')?.text ?? '').trim()

  // startsWith, not ===: the model occasionally appends a clause after the sentinel.
  if (!extracted || extracted.startsWith('NO_ASSIGNMENT_FOUND')) {
    return Response.json(
      { error: "Couldn't find an assignment in that file. Try a clearer photo or paste the text directly." },
      { status: 422 }
    )
  }

  return Response.json({ assignmentText: extracted })
}
