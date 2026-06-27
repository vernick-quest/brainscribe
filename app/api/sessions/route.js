import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { logAnthropicUsage } from '@/lib/usage'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { onboardingGreeting } from '@/lib/onboardingPrompts'

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
      content: `Read this writing assignment and produce a single JSON object with four keys: "title", "summary", "outline", and "requirements".

"title": a short default title in the format "[Writing type] on/about [topic]" — e.g. "Essay on your favorite season", "Persuasive essay on school uniforms". Under 7 words, no quotes, no trailing punctuation.

"summary": a JSON array of the key requirements. Each item has "label" (short category like "Format", "Topic", "Must include", "Length", "Goal") and "detail" (concise value). 3–6 items max, only what is explicitly stated.

"requirements": a JSON array of the NUMERIC targets the assignment explicitly states, for the progress tracker. Only include numbers that are actually given; otherwise use []. Item shapes:
- words: { "type": "words", "min": <int, optional>, "max": <int, optional>, "label": "<e.g. 300–400 words>" } — "300–400 words" → min 300, max 400; "at least 500 words" / "500 words minimum" / "500 words" → min 500; "no more than 200 words" / "up to 200 words" → max 200.
- paragraphs: { "type": "paragraphs", "target": <int>, "label": "<e.g. 5 paragraphs>" } — "five paragraphs" → target 5; "intro, 3 body paragraphs, conclusion" → target 5.
Only words and paragraphs are supported — ignore line/syllable/sentence counts.

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
  "outline": [{ "title": "Introduction", "placeholder": "...", "checklist": [{ "label": "Hook", "checked": false }], "preview": null, "paragraph": null, "done": false }],
  "requirements": [{ "type": "words", "min": 300, "max": 400, "label": "300–400 words" }, { "type": "paragraphs", "target": 5, "label": "5 paragraphs" }]
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
  // Keep only well-formed word/paragraph targets and coerce numeric fields — the
  // model sometimes emits numbers as strings ("300"), which would otherwise make
  // chipState() (typeof === 'number') treat them as missing (shows "?", never met).
  const toInt = v => {
    const n = typeof v === 'number' ? v : parseInt(v, 10)
    return Number.isFinite(n) ? n : undefined
  }
  const requirements = (Array.isArray(parsed.requirements) ? parsed.requirements : [])
    .map(r => {
      if (!r) return null
      if (r.type === 'paragraphs') {
        const target = toInt(r.target)
        return target != null ? { type: 'paragraphs', target, label: r.label } : null
      }
      if (r.type === 'words') {
        const min = toInt(r.min), max = toInt(r.max)
        if (min == null && max == null) return null
        return { type: 'words', ...(min != null ? { min } : {}), ...(max != null ? { max } : {}), label: r.label }
      }
      return null
    })
    .filter(Boolean)

  return { title, summary, outline, requirements }
}

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Daily per-account cap on session creation (fails open) — denial-of-wallet backstop.
  if (!await checkRateLimit(`sessions:day:${user.id}`, 30, 86400)) {
    return rateLimited("You've started a lot of sessions today — please try again tomorrow.")
  }

  // Coach age gate — role-independent. No one creates a coach session without a
  // 13+ assertion (or completed parental consent). Backs up the UI entry points.
  const { data: gate } = await supabase
    .from('profiles').select('role, age_bracket, coppa_consent_given').eq('id', user.id).single()
  const ageOk = gate?.age_bracket === '13plus' || gate?.coppa_consent_given === true || gate?.role === 'admin'
  if (!ageOk) {
    return Response.json({ error: 'Please confirm your age before writing with a coach.', code: 'age_verification_required' }, { status: 403 })
  }

  const { assignmentText, persona = 'owen', subject = 'unspecified', subjectCustomLabel,
          isOnboarding = false, onboardingPromptKey = null } = await request.json()
  if (!assignmentText) return Response.json({ error: 'Missing assignment' }, { status: 400 })

  try {
    // Practice (onboarding) runs don't need AI-generated metadata — the prompt is
    // a fixed warm-up, not a real assignment — so skip the Haiku meta call entirely
    // and give it a fixed "Practice session" title. Saves a model call on every
    // first-time user and keeps the practice row clearly distinct.
    if (isOnboarding) {
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          student_id: user.id,
          assignment_text: assignmentText,
          persona,
          subject: 'unspecified',
          title: 'Practice session',
          is_onboarding: true,
          onboarding_prompt_key: onboardingPromptKey,
        })
        .select()
        .single()

      if (error) {
        console.error('[sessions POST] onboarding insert error:', error)
        return Response.json({ error: error.message }, { status: 500 })
      }

      // Persist Owen's opening line as the first message so it survives navigation
      // (it shows in the transcript and when the student returns mid-warm-up). The
      // client otherwise delivers the greeting locally and never saves it.
      const { data: greetProfile } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).single()
      const greetName = greetProfile?.full_name?.split(' ')[0] ?? 'there'
      const { error: greetErr } = await supabase.from('messages').insert({
        session_id: data.id,
        role: 'assistant',
        content: onboardingGreeting(greetName),
      })
      if (greetErr) console.error('[sessions POST] greeting insert failed:', greetErr.message)

      return Response.json(data)
    }

    // One AI call for all metadata, in parallel with creating the session row
    const [{ title, summary, outline, requirements }, { data, error }] = await Promise.all([
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

    // Structured numeric requirements live in their own guarded write so a parse
    // miss — or migration 017 not yet applied (column absent) — can never break
    // core session creation. actual starts at zero and is recomputed as the
    // student writes (lib/requirements.js → persistRequirementsActual).
    const requirementsValue = { targets: requirements ?? [], actual: { words: 0, paragraphs: 0 } }
    const { error: reqErr } = await supabase.from('sessions')
      .update({ requirements: requirementsValue }).eq('id', data.id)
    if (reqErr) console.error('[sessions POST] requirements write skipped:', reqErr.message)

    return Response.json({ ...data, outline, title, assignment_summary: summary, requirements: requirementsValue })
  } catch (err) {
    console.error('[sessions POST] Unexpected error:', err)
    return Response.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
}
