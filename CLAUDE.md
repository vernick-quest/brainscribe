@AGENTS.md

# BrainScribe

Invite-only AI **writing coach** for students (including under-13, behind a COPPA parental-consent flow). A student works on an assignment; an AI coach persona (e.g. "Owen") guides them Socratically by **voice and text** instead of writing for them; linked parents/teachers can read the transcript. Live at **www.brainscribe.io** on Vercel.

## Stack (source of truth: `package.json`)
- **Next.js 16.2.7**, App Router — NOT 15. Treat framework APIs as potentially changed; see `AGENTS.md` and read `node_modules/next/dist/docs/` before using them. Middleware is **`proxy.js`** at the root (renamed from `middleware` in 16) — it runs Supabase `updateSession`, which also **canonicalizes the host**: non-`/api` requests on `brainscribe.vercel.app` are 308'd to `www.brainscribe.io` so OAuth's per-domain PKCE `code_verifier` cookie always resolves on one host. Keep `/api/*` exempt or a cross-origin redirect strips the Cron `Authorization` bearer.
- React 19.2.4, Tailwind v4.
- App code is **`.js` / `.jsx`** despite the TS config. Match the existing extension of the file you're in; don't convert files to TypeScript.
- **Supabase** (`@supabase/ssr`): Postgres + Auth (Google OAuth) + RLS. Clients live in `lib/supabase/{client,server,service,middleware}.js` — pick the right one (browser vs server vs service-role).
- **Anthropic SDK**: the coach + text-assembly models.
- **ElevenLabs**: voice — TTS via `/api/speak`, realtime STT ("Scribe") via `/api/scribe-token` + `components/MicButton.js`.

## Commands
- Dev: `npm run dev` · Build: `npm run build` · Lint: `npm run lint`
- Deploy: `vercel deploy --prod --yes` (production; aliases www.brainscribe.io). The remote build is atomic — a failed build won't swap prod.
- **Definition of done: run `npm run build` AND `npm run test:run`, and confirm BOTH pass, before calling any change finished.** The Vitest suite (fast, pure, deterministic) guards the safety/auth invariants — COPPA gate (`lib/coppa.js`), OAuth open-redirect (`lib/redirect.js`), access/Beta-Circle rules (`lib/access.js`), greeting resolver — and is enforced by the `deploy` skill's pre-flight gate, so a red test blocks the deploy. **Ratchet: when you add or change `lib/` logic, add/extend its `*.test.js` in the same change** (co-located, synthetic fixtures only — this repo is public). For UI/behavior the build can't prove, the manual checklist is `TESTING.md` — **append-only with dated section headers** (add a new dated section, never rewrite old ones; they're the audit trail).

## Architecture map
- **Two model calls per writing turn**: a streaming Socratic coach (`/api/tutor`) and text cleanup/assembly (`/api/scribe`, `/api/assemble*`). Persona definitions and system prompts are in `lib/personas.js` and `lib/prompts.js` — change coaching behavior there, not inline. `/api/tutor`'s system prompt is split by `buildCoachSystemBlocks()` into a large static prefix (marked `cache_control: ephemeral` for Anthropic prompt caching) + a small dynamic tail; the stream carries an **inline control protocol** (`[SCAFFOLD:…]`, `[ACTIVE:…]`, `[NUGGET:…]`, `[DONE:…]`, `[THESIS:…]`, `[PARA_DONE:…]`, `[DICTATE]`, `[COMPLETE]`) the client parses and strips — don't break that token contract. Assignment text is re-read from the DB (via RLS), never trusted from the request body.
- **Roles**: `admin`, `student`, `parent`, `teacher`. Parents/teachers are "watchers" linked to a student through the `relationships` table (read-only transcript access). Admin can **"remote in" / impersonate** (`lib/impersonation.js`) — when impersonating, greetings and data must reflect the *impersonated* user, not the admin (this has regressed before).
- Expensive endpoints are rate-limited (`lib/ratelimit.js`); model/voice spend is logged via `lib/usage.js`.

## Voice pipeline — historically the most fragile area; change carefully
- **TTS**: `lib/useCoachVoice.js` → `/api/speak` (ElevenLabs `eleven_turbo_v2_5`, per-persona `voiceId`). Plays through **one gesture-unlocked `<audio>` element** because mobile/desktop block autoplay until a user gesture. Do **not** pause on every gesture — that previously cut the coach off when the student merely scrolled.
- **STT**: `components/MicButton.js` uses `@elevenlabs/client` `Scribe` over a WebSocket, authed with a **single-use token** from `/api/scribe-token`. Don't reintroduce these already-fixed bugs:
  - Final transcript must land in the **writing input field**, not just under the mic button — wire `onInterim` (live) vs `onFinal` (committed) correctly.
  - The SDK logs a noisy `1006` on normal socket close (intentionally suppressed) — leave the suppression in.
  - Close the `AudioContext` exactly once (`safeClose`) to avoid a double-close.
  - Watch for latency / UI freeze right after the student speaks.

## Security & data invariants (from `AUDIT-2026-06-21.md` — keep these true)
- **COPPA consent binds to the invited parent**: require `user.email === pending.parent_email` (case-insensitive) and signer ≠ student. A fresh Google account must never be able to self-approve.
- **Validate the OAuth `next` redirect**: only allow paths starting with a single `/` (reject `//`, `/\`, and offsite) in `app/api/auth/callback`.
- **`/api/messages` must force `role:'user'`** — never trust a client-supplied message role.
- **Service-role key is server-only** (`lib/supabase/service.js`); never import it into client code or expose it.
- Under-13 7-day auto-deletion is real and required: `/api/cron/coppa-cleanup` (daily Vercel Cron, guarded by `CRON_SECRET`, fails closed). Keep it functioning whenever you touch the COPPA flow.

## Database
- **Schema changes only via new numbered migrations** in `supabase/migrations/` (currently through `023_*`; don't trust this number — `ls` the directory, and get the next number from the infra lane). Do **not** run ad-hoc SQL against prod.
- **Migrations are applied by hand.** There is no migration runner, no `supabase db push`, and no CI step — after you add a numbered file, a human pastes it into the Supabase SQL editor to run it. Code that depends on a new migration is dead until that paste happens, so **call out explicitly when a change needs a migration run** (and assume it hasn't been applied until confirmed).
- Historical live-DB drift (`is_admin()`, `invites.assignment_id`, `invites.expires_at`) was reconciled in `018_reconcile_drift.sql` — a fresh rebuild from migrations now matches prod. If you find NEW live-only objects, reconcile them the same way (own numbered migration, verbatim definitions).

## Secrets
- All keys live in `.env.local` (gitignored) and Vercel env vars. **Never paste live keys into chat or commit them** — reference `process.env.*`. See `SETUP.md` for the full list.

## Design system
Brand = navy ink + warm orange spark on cream paper. Orange (`--accent`) is reserved for *voice & action* (mic, primary CTAs, focus); use `--accent-text` for accent-colored text (the bright fill fails AA contrast as text). Tokens live in `app/globals.css` (`--type-*`, `--space-*`, semantic colors, `--tutor-*` per persona) — reference the semantic aliases, not raw values. Target WCAG AA: `:focus-visible` ring, `prefers-reduced-motion`, 44px tap targets, aria-labels. For any UI/asset work use the **`brainscribe-design`** skill (`.claude/skills/brainscribe-design/`) — it carries the full brand guide, tokens, component primitives, and a UI kit.

## Reference docs (read the relevant one before related work)
- `SETUP.md` — env vars, Supabase/Google/ElevenLabs setup, invites, parent/teacher linking.
- `TESTING.md` — current manual test checklist and known-deferred items.
- `BACKLOG.md` — deferred features (e.g. display-name validation for COPPA emails).
- `AUDIT-2026-06-21.md` — full security / COPPA / accessibility findings, plus what's already solid.
- `docs/specs/` *(local-only, gitignored — absent on a fresh clone)* — design & product specs exported from the claude.ai project; ask the user if not present. Holds the authoritative coach stream-token reference. Use the `coach-prompt` skill before changing coach behavior.
