import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { recordAnthropicUsage } from '@/lib/usage'

const anthropic = new Anthropic()

// ─────────────────────────────────────────────────────────────
// analyzeWriting
// Sends the student's completed essay to Claude, extracts a
// structured writing profile, and saves it to sessions.writing_profile.
// Returns the profile object (or null on failure).
// ─────────────────────────────────────────────────────────────
export async function analyzeWriting({ sessionId, essay, assignmentText, userId = null }) {
  if (!essay || essay.trim().length < 30) {
    console.warn('[analyzeWriting] Essay too short to analyze, skipping.')
    return null
  }

  let profile = null

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: 'You are a writing coach reviewing a middle or high school student\'s essay. Output ONLY valid JSON — no explanation, no markdown, no code fences.',
      messages: [{
        role: 'user',
        content: `Analyze the essay below and return a writing profile as JSON. Be warm, specific, and strength-first. Keep each item under 15 words.

Return ONLY this JSON format:
{
  "summary": "2-3 sentence warm overview of this student as a writer, specific to this essay.",
  "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
  "growth_areas": ["concrete thing to work on next time", "another actionable growth area"],
  "voice": "One short phrase for writing voice (e.g. 'Enthusiastic and direct')",
  "vocabulary": "Approximate grade level (e.g. 'Grade 6-7')",
  "patterns": ["recurring pattern or habit observed in the writing"]
}

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
      profile = JSON.parse(raw)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        try { profile = JSON.parse(match[0]) } catch {}
      }
    }

    if (!profile) {
      console.error('[analyzeWriting] Failed to parse Claude response:', raw)
      return null
    }
  } catch (e) {
    console.error('[analyzeWriting] Claude API error:', e)
    return null
  }

  // Save to DB via service client (bypasses RLS)
  const service = createServiceClient()
  const { error } = await service
    .from('sessions')
    .update({ writing_profile: profile })
    .eq('id', sessionId)

  if (error) {
    console.error('[analyzeWriting] DB save error:', error)
  }

  return profile
}
