import { PERSONAS } from '@/lib/prompts'
import { createClient } from '@/lib/supabase/server'
import { logElevenLabsUsage } from '@/lib/usage'
import { checkRateLimit } from '@/lib/ratelimit'

const MODEL_ID = 'eleven_turbo_v2_5'

export async function POST(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  if (!await checkRateLimit(`speak:${user.id}`, 60, 60)) return new Response('Too many requests', { status: 429 })

  const { text, persona = 'marcus', sessionId = null } = await request.json()
  if (!text) return new Response('Missing text', { status: 400 })

  const voiceId = PERSONAS[persona]?.voiceId ?? PERSONAS.marcus.voiceId

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
