import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { logAnthropicUsage } from '@/lib/usage'

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
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        fileBlock,
        {
          type: 'text',
          text: `Extract the writing assignment from this ${typeMeta.kind === 'document' ? 'PDF' : 'image'}.

Capture everything the student needs to know about WHAT to write and HOW it must be structured — this drives the coaching, so don't lose it:
- the prompt/topic
- the form or format (essay, narrative, haiku, poem, list, lab report, cover letter, etc.)
- the required structure (number of paragraphs, lines, sections, or parts)
- length requirements
- required elements (thesis, evidence, specific sections, syllable counts, rhyme scheme, etc.)
If a rubric or checklist describes structural or content requirements, INCLUDE those — that's often where the format is specified.

Leave out only pure administrative noise that doesn't change what the student writes: teacher/student names, class headers, due dates, point values, and grading-only criteria (e.g. "Grammar — 10 pts").

If no assignment is visible, reply with exactly: NO_ASSIGNMENT_FOUND`,
        },
      ],
    }],
  })

  logAnthropicUsage({ model: 'claude-haiku-4-5-20251001', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, userId: user.id })

  const extracted = response.content[0].text.trim()

  if (extracted === 'NO_ASSIGNMENT_FOUND') {
    return Response.json(
      { error: "Couldn't find an assignment in that file. Try a clearer photo or paste the text directly." },
      { status: 422 }
    )
  }

  return Response.json({ assignmentText: extracted })
}
