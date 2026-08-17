import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicUsage } from '@/lib/usage'

const anthropic = new Anthropic()

const ASSEMBLE_SYSTEM = `You are a faithful scribe. Your only job is to flow the provided paragraph components into a single, cohesive paragraph.

STRICT RULES:
- Use ONLY the ideas and words provided in the components.
- Do NOT add arguments, transitions, evidence, or ideas that do not appear in the components.
- Do NOT remove any of the student's ideas.
- Fix obvious spelling errors and smooth transitions between components — that is all.
- Preserve the student's natural voice and vocabulary.
- Output ONLY the assembled paragraph — no commentary, no labels, no preamble.`

// Thrown when the model ran out of room mid-paragraph. A truncated assembly must NEVER
// be written: `assembled` becomes `paragraphs.scribed_text`, which IS the student's
// Final Draft — the thing they read, the teacher reads, and the word count measures.
// Failing loudly loses a click; writing a fragment loses their work and looks finished.
export class AssemblyTruncatedError extends Error {
  constructor(words) {
    super(`Assembly hit the token ceiling after about ${words} words — refusing to save a partial draft.`)
    this.name = 'AssemblyTruncatedError'
    this.code = 'assembly_truncated'
  }
}

// Flow confirmed components into one cohesive paragraph (faithful to the student's
// words). Shared by the manual assemble endpoint and the auto-assemble-on-complete
// path so both produce identical prose. components: [{ id, label, text }]
//
// 🔴 THROWS AssemblyTruncatedError rather than returning a partial. Found 2026-08-16:
// a student had 1,227 words of confirmed components and this ceiling was 600 tokens
// (~450 words). Pressing Assemble would have written roughly a third of her story over
// her Final Draft, with no error and no log — the same silent-cut shape that had just
// been fixed one step upstream in /api/tutor, sitting undetected in the step that
// produces the artifact everybody actually reads.
export async function assembleParagraphText({ components, paragraphType, sessionId, userId }) {
  const componentText = (components ?? [])
    .filter(c => c.text?.trim())
    .map(c => `${c.label}: ${c.text}`)
    .join('\n\n')
  if (!componentText) return { assembled: '', componentText: '' }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    // 4000, raised from 600 on 2026-08-16. This ceiling bounds THE STUDENT'S PARAGRAPH,
    // not the model's commentary — the system prompt above forbids adding anything, so
    // output length is their input length. 600 tokens is ~450 words, and a high-school
    // narrative section runs well past that. Matches /api/tutor's ceiling.
    max_tokens: 4000,
    system: ASSEMBLE_SYSTEM,
    messages: [{
      role: 'user',
      content: `Assemble these ${paragraphType ?? 'prose'} paragraph components into a single flowing paragraph:\n\n${componentText}`,
    }],
  })

  logAnthropicUsage({ model: 'claude-haiku-4-5-20251001', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, sessionId, userId })

  const assembled = response.content[0].text.trim()

  // Check the VALUE, not the absence of an error. A truncated response arrives as a
  // perfectly successful API call carrying stop_reason 'max_tokens' — the reassuring
  // direction, exactly like a PostgREST 204 on a zero-row update.
  if (response.stop_reason === 'max_tokens') {
    const words = assembled.trim() ? assembled.trim().split(/\s+/).length : 0
    console.error(`[assemble] TRUNCATED at max_tokens for session ${sessionId} — refusing to save ${words} words over the student's draft`)
    throw new AssemblyTruncatedError(words)
  }

  return { assembled, componentText }
}
