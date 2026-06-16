import { after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const ANTHROPIC_PRICING = {
  'claude-sonnet-4-6':         { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5  },
}

// ElevenLabs is a subscription, not pay-per-use — this is an *allocation* rate
// (USD per character) used to attribute TTS spend across users for relative
// comparison, not a true marginal cost.
//
// Turbo/Flash (this app's model) bills 0.5 credits per character, so per-char USD =
// (monthly $ ÷ monthly credits) × 0.5. On a plan change, set the value below to the
// matching row (or override via the ELEVENLABS_USD_PER_CHAR env var). Per-char cost
// is ~flat across tiers — higher tiers buy volume, not a unit discount.
//   Starter  $6/mo    30K credits  → 0.0001     /char
//   Creator  $22/mo   121K credits → 0.0000909  /char   ← current plan
//   Pro      $99/mo   600K credits → 0.0000825  /char
//   Scale    $299/mo  1.8M credits → 0.0000831  /char
// Verify against your ElevenLabs dashboard (logged characters × 0.5 ≈ credits used).
const ELEVENLABS_USD_PER_CHAR = Number(process.env.ELEVENLABS_USD_PER_CHAR) || 0.0000909

function anthropicCost(model, inputTokens, outputTokens) {
  const p = ANTHROPIC_PRICING[model] ?? { input: 3, output: 15 }
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

// Awaitable worker. Inserts via the service client, so it works in ANY context —
// streaming bodies, after() callbacks, or detached background tasks where request
// APIs aren't available.
export async function recordAnthropicUsage({ model, inputTokens, outputTokens, sessionId = null, userId = null }) {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('api_usage').insert({
      service: 'anthropic',
      model,
      session_id: sessionId,
      user_id: userId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: anthropicCost(model, inputTokens, outputTokens),
    })
    if (error) console.error('[usage] anthropic insert failed:', error.message)
  } catch (e) {
    console.error('[usage] Failed to log Anthropic usage:', e)
  }
}

// Fire-and-forget wrapper for synchronous route handlers — defers the insert to
// after() so it never blocks the response but still completes after return.
export function logAnthropicUsage(args) {
  after(() => recordAnthropicUsage(args))
}

// ElevenLabs TTS — billed per character of input text.
export async function recordElevenLabsUsage({ characters, sessionId = null, userId = null }) {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('api_usage').insert({
      service: 'elevenlabs',
      session_id: sessionId,
      user_id: userId,
      characters,
      cost_usd: characters * ELEVENLABS_USD_PER_CHAR,
    })
    if (error) console.error('[usage] elevenlabs insert failed:', error.message)
  } catch (e) {
    console.error('[usage] Failed to log ElevenLabs usage:', e)
  }
}

export function logElevenLabsUsage(args) {
  after(() => recordElevenLabsUsage(args))
}
