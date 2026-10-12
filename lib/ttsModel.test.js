import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = f => readFileSync(join(ROOT, f), 'utf8')

// ── TTS model: one model, not deprecated (2026-10-11) ──────────────────────────────
// The coach-picker intro clips are pre-rendered by scripts/pregen-coach-intros.mjs "with the
// same model + voice settings as /api/speak" — a claim that only holds if the two constants
// move together. eleven_turbo_v2_5 is deprecated in ElevenLabs' model docs.
describe('TTS model — /api/speak and the intro pre-render agree, and neither is deprecated', () => {
  const modelOf = f => (read(f).match(/const MODEL_ID = '([^']+)'/) || [])[1]
  it('both use the same model id', () => {
    expect(modelOf('app/api/speak/route.js')).toBeTruthy()
    expect(modelOf('scripts/pregen-coach-intros.mjs')).toBe(modelOf('app/api/speak/route.js'))
  })
  it('the model is not one ElevenLabs lists as deprecated', () => {
    expect(['eleven_turbo_v2_5', 'eleven_turbo_v2'])   // the two the docs mark deprecated (checked 2026-10-11)
      .not.toContain(modelOf('app/api/speak/route.js'))
  })
})
