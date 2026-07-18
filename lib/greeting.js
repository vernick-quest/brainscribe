// Shared source of truth for the coach's opening line on a brand-new
// (no-written-work-yet) assignment session.
//
// Imported by BOTH:
//   - app/api/sessions/route.js — persists it as the first `role:'assistant'`
//     message when a non-onboarding session is created, so it survives reloads,
//     resumes, and shows in transcripts (mirrors the onboarding precedent).
//   - components/TutorSession.js — the client `buildGreeting` no-scaffold branch
//     delegates here, so the persisted text and any client fallback can NEVER drift.
//
// This replicates ONLY the "no scaffold / haven't started" branch of the old
// client-side buildGreeting. The scaffold-aware, resume ("welcome back"), and
// persona-switch greetings intentionally stay client-only and ephemeral.

// Retired persona keys (pre-015_persona_rename) → current keys. Kept in sync with
// RETIRED_PERSONA_MAP in TutorSession.js; this map is frozen (tied to a historical
// migration) so an old session key resolves to the same greeting the client shows.
const RETIRED_PERSONA_MAP = {
  jordan: 'jade',
  isla: 'matilda',
  verity: 'matilda',
  marcus: 'deon',
  oliver: 'alistair',
}
const CURRENT_PERSONAS = new Set(['deon', 'zoe', 'alistair', 'matilda', 'owen', 'jade'])

// Normalize any stored/legacy persona key to a current one (defaults to owen).
// Idempotent, so callers may pass an already-resolved key safely.
export function resolveGreetingPersona(key) {
  if (key && CURRENT_PERSONAS.has(key)) return key
  if (key && RETIRED_PERSONA_MAP[key]) return RETIRED_PERSONA_MAP[key]
  return 'owen'
}

// The deterministic opening line for a session with no written work yet. `persona`
// may be any current or retired key; `name` is the student's first name.
export function newSessionGreeting(persona, name = 'there') {
  const p = resolveGreetingPersona(persona)
  const g = {
    deon: `Hey ${name}. I've read the assignment. Have you started writing anything? Paste it below if so — if not, we'll build from scratch.`,
    zoe:    `Hi ${name}! I've read your assignment — have you written anything yet? Paste it below, or if you're starting fresh, no worries at all — we'll figure it out together!`,
    alistair: `Hello ${name}. I'm Alistair. I've read the assignment. Before we begin — have you written anything so far? Paste it below if you have. If not, no matter — we'll work through it.`,
    matilda:   `Hi ${name} — I'm Tilly, lovely to meet you. I've read through your assignment. Have you started anything yet? That's completely fine if not — we'll find our way in together.`,
    owen:    `Hi ${name}. I'm Owen. I've had a look at your assignment. There's no rush — we'll just take this one step at a time. Have you written anything so far? If not, that's totally okay.`,
    jade: `hey ${name}! okay I read the assignment — have you started anything yet? paste it below if you have. if not, no stress at all, we'll just figure it out together.`,
  }
  return g[p] ?? g.owen
}
