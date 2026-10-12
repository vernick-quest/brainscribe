import { PERSONAS } from '@/lib/prompts'
import { createClient } from '@/lib/supabase/server'
import { logElevenLabsUsage } from '@/lib/usage'
import { checkRateLimit } from '@/lib/ratelimit'
import { COACH_GATE_COLUMNS, coachGateFailure } from '@/lib/access'

// eleven_flash_v2_5 (2026-10-11). ElevenLabs' model docs mark eleven_turbo_v2_5 DEPRECATED and
// "functionally equivalent" to Flash v2.5 "except the latency on the Flash models is lower on
// average", recommending Flash "in all use cases". Same list price per character. Measured
// before switching: all six persona voiceIds return 200 audio/mpeg on Flash; on one 63-char
// line (n=3) Flash's time-to-complete-clip was 276-348 ms vs turbo 266-506 ms — while the
// newer eleven_v4_turbo took 735-1108 ms to finish the same clip, which matters because the
// client waits for the whole clip (res.blob()). Keep scripts/pregen-coach-intros.mjs in step.
const MODEL_ID = 'eleven_flash_v2_5'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // Coach reachability gate (lib/access.js) — free TTS is a coach capability, so an
  // unconsented under-13 OR an authed user with no Beta access must not reach it.
  const { data: gate } = await supabase
    .from('profiles').select(COACH_GATE_COLUMNS).eq('id', user.id).single()
  const gateFail = coachGateFailure(gate)
  if (gateFail) return gateFail

  if (!await checkRateLimit(`speak:${user.id}`, 60, 60)) return new Response('Too many requests', { status: 429 })
  // Daily per-account backstop against runaway TTS spend (fails open).
  if (!await checkRateLimit(`speak:day:${user.id}`, 800, 86400)) return new Response('Daily voice limit reached', { status: 429 })

  const { text, persona = 'owen', sessionId = null } = await request.json()
  if (!text) return new Response('Missing text', { status: 400 })

  const voiceId = PERSONAS[persona]?.voiceId ?? PERSONAS.owen.voiceId

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('ElevenLabs error:', err)
    return new Response('TTS failed', { status: 500 })
  }

  // ElevenLabs bills per character of input text. Log after the response.
  logElevenLabsUsage({ characters: text.length, sessionId, userId: user.id })

  return new Response(res.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
    },
  })
}
