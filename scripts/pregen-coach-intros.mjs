// One-time generator for the coach "Meet the coach" intro audio clips.
// Renders each coach's pickerIntro in their real ElevenLabs voice (same model +
// voice settings as /api/speak) to public/coaches/audio/{assetKey}.mp3.
// Static assets → instant, free-per-play, no live-TTS fragility on the picker.
// Re-run whenever a pickerIntro changes. Reads ELEVENLABS_API_KEY from .env.local.
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const MODEL_ID = 'eleven_turbo_v2_5'
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true }

// assetKey (image/color/file key) → voiceId + intro. matilda's assetKey is `tilly`.
const COACHES = [
  { key: 'owen',     voiceId: 'MFZUKuGQUsGJPQjTS4wC', text: "I'm patient and completely unhurried — we break everything into the smallest possible steps, and there's no wrong answer. Best if writing has felt hard before and you want a calm coach who never rushes you." },
  { key: 'deon',     voiceId: 'gyIv9PAQRvJjSZlk68oE', text: "I'm direct and no-nonsense — we get your ideas down first and polish later, the way a good athletics coach gets your reps in. Best if you tend to overthink and just need help to stop stalling and start moving." },
  { key: 'zoe',      voiceId: 'r1KmysJdVYZjJCm4mL3b', text: "I'm curious and genuinely excited about ideas — I chase the spark in what you're saying and ask the question that cracks the whole thing open. Best if you've got thoughts bubbling and want a coach who helps you explore them." },
  { key: 'alistair', voiceId: 'UEKYgullGqaF0keqT8Bu', text: "I'm calm and honest — I take your ideas seriously and I'll tell you plainly when an argument doesn't quite hold up yet. Best if you want straight, unhurried feedback without a lot of fuss or performed enthusiasm." },
  { key: 'tilly',    voiceId: '56bWURjYFHyYyVf490Dp', text: "I'm warm and I listen closely — I catch the specific thing you almost skipped past and help you make it count. Best if you want a coach who really notices what you say and draws out the details with you." },
  { key: 'jade',     voiceId: 'zmcVlqmyk3Jpn5AVYcAL', text: "I'm casual — more like a slightly older friend who's good at writing than a coach. We figure it out side by side, and I'll show you the messy part is just what writing actually is. Best if formal coaching feels stiff and you'd rather just talk it through." },
]

const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
const key = env.split('\n').find(l => l.startsWith('ELEVENLABS_API_KEY'))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
if (!key) { console.error('ELEVENLABS_API_KEY not found in .env.local'); process.exit(1) }

const outDir = new URL('../public/coaches/audio/', import.meta.url)
await mkdir(outDir, { recursive: true })

for (const c of COACHES) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${c.voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: c.text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
  })
  if (!res.ok) { console.error(`${c.key}: FAILED ${res.status} ${await res.text()}`); process.exit(1) }
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(new URL(`${c.key}.mp3`, outDir), buf)
  console.log(`${c.key.padEnd(9)} ${(buf.length/1024).toFixed(0)}KB  (${c.text.length} chars)`)
}
console.log('done — 6 clips in public/coaches/audio/')
