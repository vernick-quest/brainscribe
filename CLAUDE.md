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
- **Definition of done: run `npm run build` and confirm it passes before calling any change finished.** There is no automated test suite — the manual checklist is `TESTING.md`; update it when you ship UI changes.

## Architecture map
- **Two model calls per writing turn**: a streaming Socratic coach (`/api/tutor`) and text cleanup/assembly (`/api/scribe`, `/api/assemble*`). Persona definitions and system prompts are in `lib/personas.js` and `lib/prompts.js` — change coaching behavior there, not inline. `/api/tutor`'s system prompt is split by `buildCoachSystemBlocks()` into a large static prefix (marked `cache_control: ephemeral` for Anthropic prompt caching) + a small dynamic tail; the stream carries an **inline control protocol** (`[SCAFFOLD:…]`, `[ACTIVE:…]`, `[NUGGET:…]`, `[DONE:…]`, `[THESIS:…]`, `[PARA_DONE:…]`, `[COMPLETE]`) the client parses and strips — don't break that token contract. Assignment text is re-read from the DB (via RLS), never trusted from the request body.
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
- **Schema changes only via new numbered migrations** in `supabase/migrations/` (currently through `016_*`). Do **not** run ad-hoc SQL against prod.
- **Migrations are applied by hand.** There is no migration runner, no `supabase db push`, and no CI step — after you add a numbered file, a human pastes it into the Supabase SQL editor to run it. Code that depends on a new migration is dead until that paste happens, so **call out explicitly when a change needs a migration run** (and assume it hasn't been applied until confirmed).
- Known drift to reconcile if you touch it: `is_admin()` and some `invites` columns (`assignment_id`, `expires_at`) exist only in the live DB, not in any migration — add the missing migration if you modify them.

## Secrets
- All keys live in `.env.local` (gitignored) and Vercel env vars. **Never paste live keys into chat or commit them** — reference `process.env.*`. See `SETUP.md` for the full list.

## Design system
Brand = navy ink + warm orange spark on cream paper. Orange (`--accent`) is reserved for *voice & action* (mic, primary CTAs, focus); use `--accent-text` for accent-colored text (the bright fill fails AA contrast as text). Tokens live in `app/globals.css` (`--type-*`, `--space-*`, semantic colors, `--tutor-*` per persona) — reference the semantic aliases, not raw values. Target WCAG AA: `:focus-visible` ring, `prefers-reduced-motion`, 44px tap targets, aria-labels. For any UI/asset work use the **`brainscribe-design`** skill (`.claude/skills/brainscribe-design/`) — it carries the full brand guide, tokens, component primitives, and a UI kit.

## Reference docs (read the relevant one before related work)
- `SETUP.md` — env vars, Supabase/Google/ElevenLabs setup, invites, parent/teacher linking.
- `TESTING.md` — current manual test checklist and known-deferred items.
- `BACKLOG.md` — deferred features (e.g. display-name validation for COPPA emails).
- `AUDIT-2026-06-21.md` — full security / COPPA / accessibility findings, plus what's already solid.
