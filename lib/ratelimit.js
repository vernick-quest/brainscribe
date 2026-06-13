import { createServiceClient } from '@/lib/supabase/service'

// Returns true if allowed, false if the per-key limit is exceeded.
// Fails OPEN: if the limiter infra errors, legitimate users aren't blocked
// (this is denial-of-wallet protection on a kids' app, not an auth gate).
export async function checkRateLimit(key, max, windowSeconds) {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    })
    if (error) {
      console.error('[ratelimit] rpc error:', error.message)
      return true
    }
    return data === true
  } catch (e) {
    console.error('[ratelimit] failed:', e)
    return true
  }
}

// Standard 429 response for a rate-limited request.
export function rateLimited(message = 'Too many requests — please slow down a moment.') {
  return Response.json({ error: message }, { status: 429 })
}
