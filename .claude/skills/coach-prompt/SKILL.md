---
name: coach-prompt
description: Guardrails for changing BrainScribe coach behavior — system prompts, personas, or the stream-token protocol. Use before editing lib/prompts.js, lib/personas.js, app/api/tutor, or app/api/scribe.
---

# Changing coach behavior — read this first

The coach + scribe loop and its inline token protocol are the core of the product and are **silently breakable**. Do this before editing `lib/prompts.js`, `lib/personas.js`, `app/api/tutor/route.js`, or `app/api/scribe/route.js`.

## Required reading
These live in `docs/specs/` (local-only / gitignored — if missing, ask the user or pull from the claude.ai "brainscribe" project):
- **`brainscribe-stream-tokens.md`** — authoritative reference for the token protocol. Read before touching tokens or the prompt builder.
- **`brainscribe-anti-jailbreak.md`** — guardrails that apply to *every* persona.
- For behavior tuning also: `brainscribe-scaffold-improvements.md`, `brainscribe-strict-reflection.md`, `brainscribe-personas-complete.md`.

## Invariants to preserve
- **Token contract** — `[SCAFFOLD] [ACTIVE] [NUGGET] [DONE] [THESIS] [PARA_DONE] [COMPLETE]`. The server strips them via `TOKEN_RE` in `app/api/tutor/route.js`; consumers parse them in `components/TutorSession.js`, `app/api/sessions/[id]/complete/route.js`, and `app/api/scaffold/[sessionId]/route.js`. Renaming or reformatting a token silently breaks the document panel, progress tracking, and session completion — **update every consumer in the same change** (grep the token names first).
- **Prompt caching** — `buildCoachSystemBlocks()` splits a large static prefix (`cache_control: ephemeral`) from a small dynamic tail. Keep volatile content (assignment text, scaffold) in the tail; never move it into the cached prefix, or caching breaks and token cost spikes.
- **Coaching rules** — the coach/scribe never ghostwrites or originates ideas the student didn't express; ≤2 related questions per turn; warm and short. Assignment text is re-read from the DB (RLS), never trusted from the request body.

## Where it lives
`lib/prompts.js` (`buildCoachSystemBlocks`), `lib/personas.js` (6 personas, `owen` is default), `app/api/tutor/route.js` (stream + `TOKEN_RE`), `app/api/scribe/route.js`, `components/TutorSession.js` (client parser).

## After editing
Run `npm run build`, then test a live session end-to-end: tokens are stripped from what the student sees, the document panel updates, and progress + completion fire.
