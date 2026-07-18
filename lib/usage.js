import { after } from 'next/server'
import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'

// Deleted-user cost re-merge (migration 043). We capture a SHA-256 hash of the
// user's email (NOT the raw email) alongside each usage row so that after a user
// is deleted — and user_id is nulled out by the ON DELETE SET NULL on api_usage
// (migration 013) — their orphaned spend can still be grouped together for cost
// analysis WITHOUT retaining PII (retaining the raw email would conflict with the
// COPPA deletion promise; a one-way hash is fine).
//
// GATED so the app is safe to deploy in EITHER order relative to the migration:
// until migration 043 is applied AND USAGE_EMAIL_HASH_ENABLED=1 is set, we never
// put `email_hash` in the insert payload, so inserts can't fail on a missing
// column. Apply-before-deploy: infra applies 043, then flips the env flag.
const EMAIL_HASH_ENABLED = process.env.USAGE_EMAIL_HASH_ENABLED === '1'

function hashEmail(email) {
  if (!email || typeof email !== 'string') return null
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null
  return createHash('sha256').update(normalized).digest('hex')
}

// Looks up the (still-present) user's email at write time and returns its hash.
// No-ops (returns null) when the flag is off, there's no user, or anything fails —
// it must never break usage logging, which is the source of truth for cost.
async function emailHashForUser(supabase, userId) {
  if (!EMAIL_HASH_ENABLED || !userId) return null
  try {
    const { data } = await supabase.from('profiles').select('email').eq('id', userId).single()
    return hashEmail(data?.email)
  } catch {
    return null
  }
}

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
    const row = {
      service: 'anthropic',
      model,
      session_id: sessionId,
      user_id: userId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: anthropicCost(model, inputTokens, outputTokens),
    }
    const emailHash = await emailHashForUser(supabase, userId)
    if (emailHash) row.email_hash = emailHash
    const { error } = await supabase.from('api_usage').insert(row)
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
    const row = {
      service: 'elevenlabs',
      session_id: sessionId,
      user_id: userId,
      characters,
      cost_usd: characters * ELEVENLABS_USD_PER_CHAR,
    }
    const emailHash = await emailHashForUser(supabase, userId)
    if (emailHash) row.email_hash = emailHash
    const { error } = await supabase.from('api_usage').insert(row)
    if (error) console.error('[usage] elevenlabs insert failed:', error.message)
  } catch (e) {
    console.error('[usage] Failed to log ElevenLabs usage:', e)
  }
}

export function logElevenLabsUsage(args) {
  after(() => recordElevenLabsUsage(args))
}
