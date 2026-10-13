// One-time generator for the coach ACKNOWLEDGEMENT clips ("Mm, okay…") that play the
// instant a student's turn goes to the coach, covering the model's time-to-first-word.
// Renders every line in lib/ackClips.js ACK_LINES in that coach's real ElevenLabs voice
// (same model + voice settings as /api/speak and scripts/pregen-coach-intros.mjs) to
// public/coaches/audio/ack/{asset}-{n}.mp3. Committed static assets, like the intros:
// instant, free per play, no live-TTS round trip on the hot path.
//
// Re-run whenever a line in ACK_LINES changes (the mp3 IS the line).
//   node scripts/pregen-coach-acks.mjs            render only clips that are missing
//   node scripts/pregen-coach-acks.mjs --force    re-render all of them
// Prints the characters billed. Reads ELEVENLABS_API_KEY from .env.local.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { allAckClips } from '../lib/ackClips.js'

// Keep in step with app/api/speak/route.js.
const MODEL_ID = 'eleven_flash_v2_5'
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true }

// Persona key → voiceId. Same ids as lib/prompts.js PERSONAS[*].voiceId (not imported:
// that module pulls in the whole prompt). The intro script carries the same table.
const VOICE = {
  owen:     'MFZUKuGQUsGJPQjTS4wC',
  deon:     'gyIv9PAQRvJjSZlk68oE',
  zoe:      'r1KmysJdVYZjJCm4mL3b',
  alistair: 'UEKYgullGqaF0keqT8Bu',
  matilda:  '56bWURjYFHyYyVf490Dp',
  jade:     'zmcVlqmyk3Jpn5AVYcAL',
}

const force = process.argv.includes('--force')

const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
const key = env.split('\n').find(l => l.startsWith('ELEVENLABS_API_KEY'))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
if (!key) { console.error('ELEVENLABS_API_KEY not found in .env.local'); process.exit(1) }

await mkdir(new URL('../public/coaches/audio/ack/', import.meta.url), { recursive: true })

let chars = 0
let rendered = 0
for (const c of allAckClips()) {
  const out = new URL(`../public${c.path}`, import.meta.url)
  if (!force) {
    try { await access(out); continue } catch {}
  }
  const voiceId = VOICE[c.persona]
  if (!voiceId) { console.error(`${c.persona}: no voiceId`); process.exit(1) }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: c.text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
  })
  if (!res.ok) { console.error(`${c.path}: FAILED ${res.status} ${await res.text()}`); process.exit(1) }
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(out, buf)
  chars += c.text.length
  rendered++
  console.log(`${c.path.padEnd(36)} ${(buf.length / 1024).toFixed(0).padStart(3)}KB  ${c.text.length}ch  "${c.text}"`)
}
console.log(`done — ${rendered} clip(s) rendered, ${chars} characters billed`)
