import { createClient } from '@/lib/supabase/server'

const ANTHROPIC_PRICING = {
  'claude-sonnet-4-6': { input: 3,  output: 15 },
  'claude-haiku-4-5-20251001':  { input: 1,  output: 5  },
}

export async function logAnthropicUsage({ model, inputTokens, outputTokens, sessionId = null }) {
  const p = ANTHROPIC_PRICING[model] ?? { input: 3, output: 15 }
  const costUsd = (inputTokens * p.input + outputTokens * p.output) / 1_000_000
  try {
    const supabase = await createClient()
    await supabase.from('api_usage').insert({
      service: 'anthropic',
      model,
      session_id: sessionId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
    })
  } catch (e) {
    console.error('[usage] Failed to log Anthropic usage:', e)
  }
}
