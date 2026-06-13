import { PERSONAS } from '@/lib/prompts'

const MODEL_ID = 'eleven_turbo_v2_5'

export async function POST(request) {
  const { text, persona = 'marcus' } = await request.json()
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

  return new Response(res.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
    },
  })
}
