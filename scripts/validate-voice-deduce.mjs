#!/usr/bin/env node
// Free, deterministic, network-free validation of the coach-voice auto-mute
// heuristic (lib/voiceDeduce.js). NO API calls — pure logic, runs in milliseconds.
// This is the in-loop harness from the spec §Validation: scripted audio-outcome
// sequences + expected `suggest`. Exits nonzero on ANY failure.
//
//   node scripts/validate-voice-deduce.mjs
//
// Fixtures are synthetic event strings only — no user/transcript content (repo is
// public). Keep the thresholds here in sync with lib/voiceDeduce.js.

import { deduceVoiceSuggestion } from '../lib/voiceDeduce.js'

const C = { done: 'audio_completed', skip: 'audio_skipped', intr: 'audio_interrupted', absent: 'audio_absent' }

// Baseline live state: voice ON, nothing offered/dismissed yet.
const ON = { voiceCurrentlyOn: true, offeredThisSession: false, dismissedForever: false }

const FIXTURES = [
  {
    name: 'voice_loyal',
    why: 'every turn played to the end → a real listener → NEVER suggest',
    events: [C.done, C.done, C.done, C.done, C.done],
    state: ON,
    expect: false,
  },
  {
    name: 'reader',
    why: 'skipped/interrupted on ≥3 of the last 4 audio turns → suggest once',
    events: [C.done, C.skip, C.intr, C.skip, C.skip],
    state: ON,
    expect: true,
  },
  {
    name: 'occasional_skip',
    why: 'only 2 of the last 4 skipped (below threshold) → do NOT suggest',
    events: [C.done, C.skip, C.done, C.done, C.skip],
    state: ON,
    expect: false,
  },
  {
    name: 'already_dismissed',
    why: 'reader pattern BUT student permanently dismissed → do NOT suggest',
    events: [C.done, C.skip, C.intr, C.skip, C.skip],
    state: { ...ON, dismissedForever: true },
    expect: false,
  },
  {
    name: 'already_offered',
    why: 'reader pattern BUT already offered this session → do NOT suggest (once/session)',
    events: [C.done, C.skip, C.intr, C.skip, C.skip],
    state: { ...ON, offeredThisSession: true },
    expect: false,
  },
  // ── extra guards (beyond the spec's five) ──────────────────────────────────
  {
    name: 'voice_already_off',
    why: 'reader pattern BUT voice is already muted → nothing to offer',
    events: [C.done, C.skip, C.intr, C.skip, C.skip],
    state: { ...ON, voiceCurrentlyOn: false },
    expect: false,
  },
  {
    name: 'absent_does_not_count',
    why: 'audio_absent turns are not skips; too few real audio turns → do NOT suggest',
    events: [C.done, C.absent, C.absent, C.absent, C.done],
    state: ON,
    expect: false,
  },
  {
    name: 'too_few_audio_turns',
    why: '3 skips but no full 4-turn window yet → conservative, do NOT suggest',
    events: [C.skip, C.skip, C.skip],
    state: ON,
    expect: false,
  },
]

let pass = 0
let fail = 0
for (const f of FIXTURES) {
  const got = deduceVoiceSuggestion(f.events, f.state).suggest
  const ok = got === f.expect
  if (ok) pass++
  else fail++
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`${tag}  ${f.name.padEnd(22)} expected suggest=${String(f.expect).padEnd(5)} got=${String(got).padEnd(5)} — ${f.why}`)
}

console.log(`\n${pass}/${FIXTURES.length} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
