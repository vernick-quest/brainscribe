import { after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const ANTHROPIC_PRICING = {
  'claude-sonnet-4-6':         { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5  },
}

function costOf(model, inputTokens, outputTokens) {
  const p = ANTHROPIC_PRICING[model] ?? { input: 3, output: 15 }
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

// Awaitable worker. Inserts the usage row via the service client, so it works in
// ANY context — streaming bodies, after() callbacks, or detached background tasks
// (e.g. fire-and-forget analyzeWriting) where request APIs aren't available.
export async function recordAnthropicUsage({ model, inputTokens, outputTokens, sessionId = null }) {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('api_usage').insert({
      service: 'anthropic',
      model,
      session_id: sessionId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costOf(model, inputTokens, outputTokens),
    })
    if (error) console.error('[usage] insert failed:', error.message)
  } catch (e) {
    console.error('[usage] Failed to log Anthropic usage:', e)
  }
}

// Fire-and-forget wrapper for synchronous route handlers. Defers the insert to
// after() so it never blocks the response but still completes after the function
// returns (Vercel keeps the invocation alive for after() callbacks). Previously
// this was a bare floating promise that got killed on function termination — the
// reason usage rows were dropped. Only call this from a real request handler.
export function logAnthropicUsage(args) {
  after(() => recordAnthropicUsage(args))
}
