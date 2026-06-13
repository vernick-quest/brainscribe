import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

async function generateTitle(assignmentText) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 30,
    messages: [{
      role: 'user',
      content: `Read this assignment and generate a short default title in the format "[Writing type] on/about [topic]" — for example: "Essay on your favorite season", "Persuasive essay on school uniforms", "Narrative about a memorable experience". Keep it under 7 words. No quotes, no punctuation at the end.\n\nAssignment: ${assignmentText.slice(0, 400)}`,
    }],
  })
  return response.content[0].text.trim().replace(/^["']|["']$/g, '')
}

function extractJSON(text) {
  try { return JSON.parse(text) } catch {}
  const match = text.match(/\[[\s\S]*\]/)
  if (match) { try { return JSON.parse(match[0]) } catch {} }
  return null
}

async function generateSummary(assignmentText) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: 'You are a precise JSON generator. You output ONLY valid JSON arrays — no explanation, no markdown, no code fences.',
    messages: [{
      role: 'user',
      content: `Extract the key requirements from this assignment into a JSON array. Each item must have "label" (short category like "Format", "Topic", "Must include", "Length", "Goal") and "detail" (concise value). 3–6 bullets max, only include what is explicitly stated.

Output format:
[
  { "label": "Format", "detail": "5-paragraph essay (introduction, 3 body paragraphs, conclusion)" },
  { "label": "Topic", "detail": "Your favorite season and why you love it" },
  { "label": "Must include", "detail": "Thesis statement, one specific detail per body paragraph, transition words" },
  { "label": "Length", "detail": "300–400 words" }
]

Assignment:
${assignmentText}`,
    }],
  })
  return extractJSON(response.content[0].text.trim())
}

async function generateOutline(assignmentText) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    system: 'You are a precise JSON generator. Output ONLY valid JSON — no explanation, no markdown, no code fences.',
    messages: [{
      role: 'user',
      content: `Read this writing assignment carefully. Your job is to figure out exactly how many sections the student needs to write, then build a scaffold for each one.

STRUCTURE RULES — follow strictly:
- If the assignment says "one paragraph" or "a paragraph": create exactly 1 section
- If it says "two paragraphs", "three paragraphs", etc.: create exactly that many sections
- If it specifies a structure ("intro, three body paragraphs, conclusion"): follow it exactly — that's 5 sections
- If it's a short-answer or single response with no structure specified: 1 section
- If it's a narrative/story with no structure specified: use Setup, Rising Action, Climax, Resolution
- If it's an argumentative or expository essay with no structure specified: use Introduction, Body Paragraph 1, Body Paragraph 2, Body Paragraph 3, Conclusion
- Never invent extra sections beyond what the assignment requires

CONTENT RULES — make every field specific to THIS assignment:
- "title": match the assignment's own terminology when possible
- "placeholder": one sentence describing what THIS section needs to accomplish for THIS specific topic (not generic boilerplate)
- "checklist": 2–4 concrete things the student must include in this section, specific to the topic and assignment

Return a JSON array. Each item must have exactly these fields:
- "title": string
- "placeholder": string (specific to this assignment's topic)
- "checklist": [{ "label": "...", "checked": false }, ...]
- "preview": null
- "paragraph": null
- "done": false

Assignment:
${assignmentText}`,
    }],
  })

  const parsed = extractJSON(response.content[0].text)
  if (parsed && parsed.length > 0) return parsed

  // Fallback: 5-paragraph essay
  return [
    { title: 'Introduction', placeholder: 'Grab the reader\'s attention, give some background, and state your main argument.', checklist: [{ label: 'Hook', checked: false }, { label: 'Background context', checked: false }, { label: 'Thesis statement', checked: false }], preview: null, paragraph: null, done: false },
    { title: 'Body Paragraph 1', placeholder: 'Present your first supporting point with a specific example or detail.', checklist: [{ label: 'Topic sentence', checked: false }, { label: 'Supporting evidence', checked: false }, { label: 'Connection to thesis', checked: false }], preview: null, paragraph: null, done: false },
    { title: 'Body Paragraph 2', placeholder: 'Present your second supporting point with a specific example or detail.', checklist: [{ label: 'Topic sentence', checked: false }, { label: 'Supporting evidence', checked: false }, { label: 'Connection to thesis', checked: false }], preview: null, paragraph: null, done: false },
    { title: 'Body Paragraph 3', placeholder: 'Present your third supporting point with a specific example or detail.', checklist: [{ label: 'Topic sentence', checked: false }, { label: 'Supporting evidence', checked: false }, { label: 'Connection to thesis', checked: false }], preview: null, paragraph: null, done: false },
    { title: 'Conclusion', placeholder: 'Restate your thesis, summarize your main points, and leave the reader with a final thought.', checklist: [{ label: 'Restate thesis', checked: false }, { label: 'Summarize main points', checked: false }, { label: 'Closing thought', checked: false }], preview: null, paragraph: null, done: false },
  ]
}

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { assignmentText, persona = 'marcus', subject = 'unspecified', subjectCustomLabel } = await request.json()
  if (!assignmentText) return Response.json({ error: 'Missing assignment' }, { status: 400 })

  try {
    // Generate title, outline, summary — and create the session DB row — all in parallel
    const [title, outline, summary, { data, error }] = await Promise.all([
      generateTitle(assignmentText),
      generateOutline(assignmentText),
      generateSummary(assignmentText),
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
