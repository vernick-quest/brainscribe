import { after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Prices live in lib/models.js next to the model constants, so a model cannot be added
// without its price one screen away (lib/models.test.js fails if a role's model is unpriced).
import { priceCall } from '@/lib/models'

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

// An UNPRICED model fails LOUDLY. The old fallback billed every unknown model at Sonnet
// 4.6's rate, silently — a model change would have logged plausible, wrong spend forever.
// cost_usd is NOT NULL (migration 009), so the row is still written (0) to keep the tokens
// and the model name; the error is what makes that 0 impossible to mistake for "free".
//
// cost_usd INCLUDES cache writes/reads (2026-10-12). The api_usage row has no cache
// columns, and `input_tokens` keeps its old meaning (the API's UNCACHED input) — but on the
// coach the cached ~41.8k-token prefix is most of the prompt cost, and leaving it out
// under-reported every coach turn by an order of magnitude (worse on Opus 5.5, whose
// cache write is $5/MTok). Only the coach routes pass cache counts; other callers don't
// cache, so their cost is unchanged.
export function anthropicCost(model, { inputTokens = 0, outputTokens = 0, cacheWriteTokens = 0, cacheReadTokens = 0 } = {}) {
  const cost = priceCall(model, { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens })
  if (cost == null) {
    console.error(
      `[usage] 🔴 UNPRICED MODEL "${model}" — cost_usd is being written as 0 and is WRONG. ` +
      `Add it to ANTHROPIC_PRICING in lib/models.js. tokens in=${inputTokens} out=${outputTokens} ` +
      `cache_write=${cacheWriteTokens} cache_read=${cacheReadTokens}`
    )
    return 0
  }
  return cost
}

// Awaitable worker. Inserts via the service client, so it works in ANY context —
// streaming bodies, after() callbacks, or detached background tasks where request
// APIs aren't available.
export async function recordAnthropicUsage({ model, inputTokens = 0, outputTokens = 0, cacheWriteTokens = 0, cacheReadTokens = 0, sessionId = null, userId = null }) {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('api_usage').insert({
      service: 'anthropic',
      model,
      session_id: sessionId,
      user_id: userId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: anthropicCost(model, { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens }),
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
