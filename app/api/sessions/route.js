import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { logAnthropicUsage } from '@/lib/usage'

const anthropic = new Anthropic()

function extractJSON(text) {
  try { return JSON.parse(text) } catch {}
  const match = text.match(/\{[\s\S]*\}/)
  if (match) { try { return JSON.parse(match[0]) } catch {} }
  return null
}

// Default 5-paragraph essay outline — used if the model omits/garbles the outline.
const FALLBACK_OUTLINE = [
  { title: 'Introduction', placeholder: 'Grab the reader\'s attention, give some background, and state your main argument.', checklist: [{ label: 'Hook', checked: false }, { label: 'Background context', checked: false }, { label: 'Thesis statement', checked: false }], preview: null, paragraph: null, done: false },
  { title: 'Body Paragraph 1', placeholder: 'Present your first supporting point with a specific example or detail.', checklist: [{ label: 'Topic sentence', checked: false }, { label: 'Supporting evidence', checked: false }, { label: 'Connection to thesis', checked: false }], preview: null, paragraph: null, done: false },
  { title: 'Body Paragraph 2', placeholder: 'Present your second supporting point with a specific example or detail.', checklist: [{ label: 'Topic sentence', checked: false }, { label: 'Supporting evidence', checked: false }, { label: 'Connection to thesis', checked: false }], preview: null, paragraph: null, done: false },
  { title: 'Body Paragraph 3', placeholder: 'Present your third supporting point with a specific example or detail.', checklist: [{ label: 'Topic sentence', checked: false }, { label: 'Supporting evidence', checked: false }, { label: 'Connection to thesis', checked: false }], preview: null, paragraph: null, done: false },
  { title: 'Conclusion', placeholder: 'Restate your thesis, summarize your main points, and leave the reader with a final thought.', checklist: [{ label: 'Restate thesis', checked: false }, { label: 'Summarize main points', checked: false }, { label: 'Closing thought', checked: false }], preview: null, paragraph: null, done: false },
]

// Single Haiku call that produces the title, requirement summary, and section
// outline together — replaces three separate calls that each re-read the
// assignment. Per-field fallbacks keep session creation resilient to a bad parse.
async function generateSessionMeta(assignmentText, userId) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: 'You are a precise JSON generator. Output ONLY valid JSON — no explanation, no markdown, no code fences.',
    messages: [{
      role: 'user',
      content: `Read this writing assignment and produce a single JSON object with three keys: "title", "summary", and "outline".

"title": a short default title in the format "[Writing type] on/about [topic]" — e.g. "Essay on your favorite season", "Persuasive essay on school uniforms". Under 7 words, no quotes, no trailing punctuation.

"summary": a JSON array of the key requirements. Each item has "label" (short category like "Format", "Topic", "Must include", "Length", "Goal") and "detail" (concise value). 3–6 items max, only what is explicitly stated.

"outline": a JSON array of the sections the student must write. STRUCTURE RULES — follow strictly:
- "one paragraph"/"a paragraph" → exactly 1 section
- "two paragraphs", "three paragraphs", etc. → exactly that many
- a specified structure ("intro, three body paragraphs, conclusion") → follow it exactly (that's 5)
- short-answer/single response with no structure specified → 1 section
- narrative/story with no structure specified → Setup, Rising Action, Climax, Resolution
- argumentative/expository essay with no structure specified → Introduction, Body Paragraph 1, Body Paragraph 2, Body Paragraph 3, Conclusion
- never invent extra sections beyond what the assignment requires
Each outline item has exactly: "title" (string), "placeholder" (one sentence specific to THIS section and topic), "checklist" (array of 2–4 { "label": string, "checked": false } specific to this section), "preview": null, "paragraph": null, "done": false.

Output shape:
{
  "title": "Essay on your favorite season",
  "summary": [{ "label": "Format", "detail": "5-paragraph essay" }, { "label": "Length", "detail": "300–400 words" }],
  "outline": [{ "title": "Introduction", "placeholder": "...", "checklist": [{ "label": "Hook", "checked": false }], "preview": null, "paragraph": null, "done": false }]
}

Assignment:
${assignmentText}`,
    }],
  })

  logAnthropicUsage({ model: 'claude-haiku-4-5-20251001', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, userId })

  const parsed = extractJSON(response.content[0].text) ?? {}

  const title = typeof parsed.title === 'string' && parsed.title.trim()
    ? parsed.title.trim().replace(/^["']|["']$/g, '')
    : null
  const summary = Array.isArray(parsed.summary) ? parsed.summary : null
  const outline = Array.isArray(parsed.outline) && parsed.outline.length > 0 ? parsed.outline : FALLBACK_OUTLINE

  return { title, summary, outline }
}

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { assignmentText, persona = 'owen', subject = 'unspecified', subjectCustomLabel } = await request.json()
  if (!assignmentText) return Response.json({ error: 'Missing assignment' }, { status: 400 })

  try {
    // One AI call for all metadata, in parallel with creating the session row
    const [{ title, summary, outline }, { data, error }] = await Promise.all([
      generateSessionMeta(assignmentText, user.id),
      supabase
        .from('sessions')
        .insert({
          student_id: user.id,
          assignment_text: assignmentText,
          persona,
          subject,
          subject_custom_label: subject === 'other' ? (subjectCustomLabel || null) : null,
        })
        .select()
        .single()
    ])

    if (error) {
      console.error('[sessions POST] Supabase insert error:', error)
      return Response.json({ error: error.message }, { status: 500 })
    }

    await supabase.from('sessions').update({ outline, title, assignment_summary: summary }).eq('id', data.id)

    return Response.json({ ...data, outline, title, assignment_summary: summary })
  } catch (err) {
    console.error('[sessions POST] Unexpected error:', err)
    return Response.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
}
