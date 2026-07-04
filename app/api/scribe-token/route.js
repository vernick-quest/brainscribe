import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, rateLimited } from '@/lib/ratelimit'
import { canUseCoach, coachGateResponse } from '@/lib/coppa'

export async function POST() {
  // Explicit auth — don't rely solely on the proxy middleware to gate this
  // (it mints single-use ElevenLabs realtime credentials).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await checkRateLimit(`scribe-token:${user.id}`, 30, 60)) return rateLimited()

  // COPPA coach age gate (lib/coppa.js) — this token opens a live microphone
  // stream to ElevenLabs (a child's voice leaving the app), so an unconsented
  // under-13 must never be issued one.
  const { data: gate } = await supabase
    .from('profiles').select('role, age_bracket, coppa_consent_required, coppa_consent_given').eq('id', user.id).single()
  if (!canUseCoach(gate)) return coachGateResponse()

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ELEVENLABS_API_KEY is not set' }, { status: 500 })
  }

  const response = await fetch(
    'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
    }
  )

  const data = await response.json()
  return Response.json(data)
}
