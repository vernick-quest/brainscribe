// Shared source of truth for the coach's opening line on a brand-new
// (no-written-work-yet) session.
//
// 🔴 MODE-NEUTRAL WORDING. These are deterministic template literals, not prompt — the
// coach never generates them, so they are the one place the product's language is fixed
// in advance. People write here for school AND for themselves (sessions.writing_mode,
// migration 073), so they must not say "assignment" or "essay": to a student writing a
// story nobody assigned, being greeted about their "assignment" is the product not
// listening. They are neutral rather than mode-branched on purpose — neutral reads
// correctly for 'school', 'personal' AND 'unknown', and 'unknown' is the honest default
// that no branch could serve.
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
// Did the upload already contain the student's own answers? The parse marks them with this
// exact heading (see app/api/parse-assignment). Shared so the greeting and the coach agree —
// asking "have you written anything?" about work we can already see reads as not listening,
// and it made a student answer "yes it should be in the upload" to a question we had the
// answer to.
export const EXISTING_WORK_MARKER = 'ALREADY WRITTEN BY THE STUDENT'
export function hasExistingWork(assignmentText) {
  return String(assignmentText ?? '').includes(EXISTING_WORK_MARKER)
}

export function newSessionGreeting(persona, name = 'there', { existingWork = false } = {}) {
  const p = resolveGreetingPersona(persona)
  // They uploaded a partly-filled worksheet. Don't ask what we can already see — say we
  // have it, and that nothing is lost. The coach then reads it back (Rule 0).
  if (existingWork) {
    const w = {
      deon: `Hey ${name}. I've read it — and I can see the parts you've already filled in. Nothing's lost. Let's go through it and see what's done and what could use more.`,
      zoe: `Hi ${name}! I've read it — and ooh, you've already got a bunch of it filled in! Nothing's lost, promise. Let's look at what you've got and see if any of it wants a little more.`,
      alistair: `Hello ${name}. I'm Alistair. I've read it through, including the parts you have already completed — none of it is lost. Let us review what you have and consider where it might be strengthened.`,
      matilda: `Hi ${name} — I'm Tilly. I've read it through, and I can see you've already filled some of it in. Nothing's gone anywhere. Shall we look through what you've got together?`,
      owen: `Hi ${name}. I'm Owen. I've had a look — and I can see the parts you've already filled in. Nothing's lost. Let's go through what you've got and see if any of it wants a bit more.`,
      jade: `hey ${name}! okay I read it — and you've already got a chunk of it done. nothing's lost. let's look through what you wrote and see if any of it wants more.`,
    }
    return w[p] ?? w.owen
  }
  const g = {
    deon: `Hey ${name}. I've read what you're working on. Have you started writing anything? Paste it below if so — if not, we'll build from scratch.`,
    zoe:    `Hi ${name}! I've read what you're working on — have you written anything yet? Paste it below, or if you're starting fresh, no worries at all — we'll figure it out together!`,
    alistair: `Hello ${name}. I'm Alistair. I've read what you're working on. Before we begin — have you written anything so far? Paste it below if you have. If not, no matter — we'll work through it.`,
    matilda:   `Hi ${name} — I'm Tilly, lovely to meet you. I've read through what you're working on. Have you started anything yet? That's completely fine if not — we'll find our way in together.`,
    owen:    `Hi ${name}. I'm Owen. I've had a look at what you're working on. There's no rush — we'll just take this one step at a time. Have you written anything so far? If not, that's totally okay.`,
    jade: `hey ${name}! okay I read what you're working on — have you started anything yet? paste it below if you have. if not, no stress at all, we'll just figure it out together.`,
  }
  return g[p] ?? g.owen
}
