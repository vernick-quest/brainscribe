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

// Flow confirmed components into one cohesive paragraph (faithful to the student's
// words). Shared by the manual assemble endpoint and the auto-assemble-on-complete
// path so both produce identical prose. components: [{ id, label, text }]
export async function assembleParagraphText({ components, paragraphType, sessionId, userId }) {
  const componentText = (components ?? [])
    .filter(c => c.text?.trim())
    .map(c => `${c.label}: ${c.text}`)
    .join('\n\n')
  if (!componentText) return { assembled: '', componentText: '' }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: ASSEMBLE_SYSTEM,
    messages: [{
      role: 'user',
      content: `Assemble these ${paragraphType ?? 'prose'} paragraph components into a single flowing paragraph:\n\n${componentText}`,
    }],
  })

  logAnthropicUsage({ model: 'claude-haiku-4-5-20251001', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, sessionId, userId })

  return { assembled: response.content[0].text.trim(), componentText }
}
