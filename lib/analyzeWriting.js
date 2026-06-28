import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { recordAnthropicUsage } from '@/lib/usage'

const anthropic = new Anthropic()

// ─────────────────────────────────────────────────────────────
// analyzeWriting
// Sends the student's completed essay to Claude in ONE Haiku call
// and extracts TWO structured outputs:
//   • the per-session writing profile  → sessions.writing_profile
//   • an updated cross-assignment aggregate → profiles.writing_profile_aggregate
// The aggregate is synthesized from the student's prior aggregate (may be
// null on first completion) plus this new essay — no second SDK call.
// Returns the per-session profile object (or null on failure).
// ─────────────────────────────────────────────────────────────
export async function analyzeWriting({ sessionId, essay, assignmentText, userId = null }) {
  if (!essay || essay.trim().length < 30) {
    console.warn('[analyzeWriting] Essay too short to analyze, skipping.')
    return null
  }

  const service = createServiceClient()

  // Resolve the student this session belongs to and read their running
  // aggregate. Keyed on the session's student — never the caller — so a
  // teacher/admin re-trigger accumulates onto the student's profile, not their
  // own. Practice/onboarding sessions are excluded from the aggregate so
  // warm-ups don't pollute the cross-assignment trajectory.
  let studentId = null
  let isOnboarding = false
  let priorAggregate = null
  {
    const { data: sessionRow } = await service
      .from('sessions')
      .select('student_id, is_onboarding')
      .eq('id', sessionId)
      .single()
    studentId = sessionRow?.student_id ?? null
    isOnboarding = sessionRow?.is_onboarding === true
    if (studentId && !isOnboarding) {
      const { data: prof } = await service
        .from('profiles')
        .select('writing_profile_aggregate')
        .eq('id', studentId)
        .single()
      priorAggregate = prof?.writing_profile_aggregate ?? null
    }
  }

  const accumulateAggregate = !!studentId && !isOnboarding
  const priorAggregateText = priorAggregate
    ? JSON.stringify(priorAggregate)
    : "(none — this is the student's first completed assignment)"

  let parsed = null

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: "You are a writing coach reviewing a middle or high school student's essay and maintaining a running profile of them as a writer across assignments. Output ONLY valid JSON — no explanation, no markdown, no code fences.",
      messages: [{
        role: 'user',
        content: `You are producing TWO things from the student's completed essay:
1. "profile" — a snapshot of THIS essay.
2. "aggregate" — an updated running profile across ALL their assignments so far, synthesized from their prior aggregate (if any) plus this new essay.

Be warm, specific, and strength-first. Keep each list item under 15 words. For every "vocabulary.highlights", use 2-3 strong words the student ACTUALLY used in this essay — real words pulled from the text below, never invented examples.

Return ONLY this JSON (no markdown, no code fences):
{
  "profile": {
    "summary": "2-3 sentence warm overview of this student as a writer, specific to this essay.",
    "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
    "growth_areas": ["concrete thing to work on next time", "another actionable growth area"],
    "voice": "One short phrase for writing voice (e.g. 'Enthusiastic and direct')",
    "vocabulary": {
      "descriptor": "Short phrase for the character of the word choice (e.g. 'Precise and varied')",
      "highlights": ["2-3 strong words actually used in this essay"],
      "reach": "One concrete, number-free direction to stretch (e.g. 'swap very+adjective for stronger verbs')"
    },
    "patterns": ["recurring pattern or habit observed in the writing"]
  },
  "aggregate": {
    "summary": "2-3 sentence overview of the student as a writer across all their work so far.",
    "strengths": ["persistent strength across assignments"],
    "growth_areas": ["persistent or recurring growth area still worth working on"],
    "voice": "One short phrase for their overall writing voice",
    "vocabulary": {
      "descriptor": "Overall character of their word choice across assignments",
      "highlights": ["2-3 strong words from THIS newest essay"],
      "reach": "One concrete, number-free direction to stretch"
    },
    "patterns": ["recurring pattern across their writing"],
    "trajectory": "1-2 sentences on how the writing is changing across assignments.",
    "milestones": ["something visibly improved compared to earlier work"]
  }
}

SYNTHESIS RULES for "aggregate":
- Weight recent work more heavily, but preserve persistent growth areas — don't drop a growth area just because this single essay didn't surface it.
- "vocabulary.highlights" must refresh to THIS newest essay's words; "vocabulary.descriptor" should reflect the overall trend across assignments.
- If there is no prior aggregate (first assignment), this essay IS the baseline: set "milestones" to [] and make "trajectory" a short baseline note (e.g. "First assignment on record — a starting point to track growth from.").

Student's prior aggregate (their running profile before this essay):
${priorAggregateText}

Assignment prompt:
${assignmentText ?? '(not provided)'}

Student essay:
${essay}`,
      }],
    })

    // Detached context (called fire-and-forget) — await the worker directly
    await recordAnthropicUsage({ model: 'claude-haiku-4-5-20251001', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, sessionId, userId })

    const raw = response.content[0].text.trim()

    // Try direct parse, then extract first {...} block
    try {
      parsed = JSON.parse(raw)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        try { parsed = JSON.parse(match[0]) } catch {}
      }
    }

    if (!parsed) {
      console.error('[analyzeWriting] Failed to parse Claude response:', raw)
      return null
    }
  } catch (e) {
    console.error('[analyzeWriting] Claude API error:', e)
    return null
  }

  // Envelope shape is { profile, aggregate }. Fall back to treating the whole
  // object as the session profile if the model returned the older flat shape.
  const sessionProfile = parsed.profile ?? (parsed.summary ? parsed : null)
  let aggregate = parsed.aggregate ?? null

  if (!sessionProfile) {
    console.error('[analyzeWriting] No usable profile in parsed response:', parsed)
    return null
  }

  // Save the per-session profile (unchanged target).
  const { error: sessErr } = await service
    .from('sessions')
    .update({ writing_profile: sessionProfile })
    .eq('id', sessionId)
  if (sessErr) console.error('[analyzeWriting] session profile save error:', sessErr)

  // Save the updated cross-assignment aggregate. based_on_count and updated_at
  // are stamped server-side, never trusted from the model.
  if (accumulateAggregate && aggregate) {
    aggregate.based_on_count = (priorAggregate?.based_on_count ?? 0) + 1
    aggregate.updated_at = new Date().toISOString()
    const { error: aggErr } = await service
      .from('profiles')
      .update({ writing_profile_aggregate: aggregate })
      .eq('id', studentId)
    if (aggErr) console.error('[analyzeWriting] aggregate save error:', aggErr)
  }

  return sessionProfile
}
