# BrainScribe — Backlog

Deferred features and improvements, with enough detail to pick up cold.

---

# PRIORITIZED — added 2026-08-05, out of the six-drop-path incident

## P1 — A pause switch for the whole service, toggleable without a deploy
**Why (2026-08-08, Robert):** "we need a way to pause the service for users when we find a
major problem. we probably don't want people doing work if we are changing things around."

Today the only tool is a per-feature kill switch compiled into the source — that is what
switched "Keep working" off when the v2 cursor drop path surfaced. It works, but the loop is
**edit a constant, run the gate, build, ship** — minutes during which students are still
writing into a path we already believe is losing their words. And it is per-feature: there is
no way to say "stop everything for ten minutes while I change something underneath."

**What it needs to do**
- **Block NEW work, never destroy in-flight work.** A student mid-session must still be able
  to save and finish what is on screen — cutting them off mid-sentence would cause exactly
  the loss the pause exists to prevent. Stop new sessions, new continuations, new dictation
  starts; let an open session drain.
- **Toggle without a deploy.** A row in the DB (or an env flag read per request) an admin
  flips from /admin. The reason it must not be a code constant is speed: the moment you know
  writing is being lost, the fix window is seconds, not a build.
- **Say something true and kind.** Not "500". Something like "We're fixing something — your
  work is saved and nothing is lost. Back in a few minutes." Under-13 students read this too.
- **Never block the admin.** Whoever is diagnosing must still reach /admin and the transcript
  pages, or the pause blinds the person fixing it.
- **Scope levels.** At minimum: everything / new-sessions-only / one named feature. The
  per-feature switches we hand-roll (CONTINUATION_ENABLED) should collapse into this.
- **Loud while it is on.** A banner for admins on every page, and an entry in TESTING.md or a
  log so a pause left on overnight is impossible to miss. A silent pause is its own outage.

**Two reasons to pause, and they want different behaviour** (Robert, 2026-08-08: "kill switch
was for future fixes, down time"):
- **Emergency** — you just found something losing student work. No warning is possible; the
  point is speed. Stop new work THIS SECOND, drain what's open, apologise afterwards.
- **Planned** — you're changing something underneath and want the app quiet while you do it.
  Here you DO get to warn: a scheduled window, a banner some hours ahead ("BrainScribe will
  be down for about 20 minutes at 7pm"), and ideally a nudge in-session ("good moment to lock
  in what you've got"). A student who loses their thread because the app went dark
  mid-sentence is the same harm the pause exists to prevent, just self-inflicted.

Both flow through one switch; the planned path is the emergency path plus a scheduled start
and pre-announcement. Build the emergency path first — it is the one you cannot improvise.

**Watch out for:** the check runs on every request, so it must fail OPEN on a read error —
a paused-because-the-lookup-failed service is a worse outage than the bug. Cache it briefly.

## P0 — Move the prompt harness into the repo  ◐ STARTED 2026-08-08
**Why:** It lives in a scratchpad under `/private/tmp`, which gets swept. The thing that
finally caught two unverified prompt changes is one cleanup away from not existing.
**Done:** `scripts/prompt-harness/lib/harness.mjs` (shared runner — builds the prompt FROM
SOURCE, sends it in the same two blocks `/api/tutor` does) + `word-target.mjs` +
`npm run test:prompts`. ~4s, ~$0.01 per probe.
**Still to port — and this is the blocker, not the file move:** the three scratchpad probes
(coach first turn, the "???" fabrication replay, the warm-up redirect) **replay real student
turns verbatim** — Baron's book-report answers and Bruce's Civil War exchange are sitting in
those files. This repo is PUBLIC. Each fixture has to be re-authored as a synthetic
reconstruction that still triggers the same behaviour before it can be committed. Copying
them across as-is would publish student writing; do not do it in a hurry.
Scratchpad originals (until swept):
`/private/tmp/claude-501/-Users-robert/71d976c2-*/scratchpad/ocrtest/`

## P0 — Scaffold-less sessions invisible to the integrity detector  ✅ DONE 2026-08-05
9 of 27 completed sessions have no `paragraph_scaffolds` row, so every detector signal (they
all read `components`) is blind to them. Backstop shipped; the fuller fix is P2 below.

## P1 — Verification traps into CLAUDE.md  ✅ DONE 2026-08-05
Memory is recalled selectively; CLAUDE.md loads every session. See "Verification discipline".

## P1 — Adversarial review as a gate, not a reaction
**Why:** A red-team pass found three high-severity bugs *in the fixes for the previous three* —
one of which destroyed text. Self-review found none of them.
**Build:** a pre-merge checklist item in the `deploy` skill for a defined blast radius — the
scaffold write path, `lib/prompts.js`, or anything persisting student work. Fable is free on
the Max plan, so the cost is wall-clock, not dollars.

## P2 — Hook: block a production deploy when tests are stale
**Why:** Mechanical enforcement is the only kind that survives a long session. The existing
`PreToolUse` worktree block fired twice on 2026-08-05 and did exactly its job.
**Build:** refuse `vercel deploy --prod` when the newest mtime under `app/`, `lib/`, `components/` is
later than the last `vitest run`. Same shape as `~/.claude/hooks/block-worktree-deploy.py`.
⚠️ Write the guard so it does not match BACKLOG.md's own text — this file tripped it once.

## P2 — Form-shaped assignments: parse as fields, scaffold as fields
Full spec: `docs/specs/spec-form-assignments.md` (local-only). Makes non-prose assignments
work properly; the P0 backstop only makes their failures VISIBLE. Lane:
`focus/assignment-intake`. Instrument `form.kind` at parse time so the next conversation is
about frequency rather than anecdote.

## P3 — Coach emission rates are unmeasured
Both red-team passes flagged the same limit: the fixes are correct for when a token arrives,
but **how often** the coach emits a cross-section id, a bare `[DONE:]` recap, or a truncating
fragment comes from old sim annotations, not fresh measurement. A billed sim run against the
live coach would close it. ⚠️ Costs real money — warn and get a go-ahead first.

---


## Student name validation at signup (COPPA email quality)
**Why:** The Google display name is pulled straight into the COPPA consent email,
but it can be an org/nickname/placeholder (the "Next Level Soccer" test account
exposed this). A wrong name in a consent email to a real parent looks like spam.

**What to build:**
- **Migration** (run manually in Supabase SQL editor):
  ```sql
  alter table profiles
  add column display_name_confirmed boolean default false,
  add column display_name_confirmed_at timestamptz;
  ```
- **Detection** — after Google OAuth, flag the display name as "needs confirming" if any:
  - more than 3 words
  - contains org words: Soccer, Sports, Academy, Club, FC, LLC, Inc, School, Team, United, City, Youth, Next, Level
  - all caps
  - contains numbers
- **Prompt** (in the `/welcome` signup flow, before age/role; only when flagged and
  `display_name_confirmed = false`). Soft nudge, not a hard block:
  > "Just checking — is '{display_name}' your real name? BrainScribe uses your name
  > when contacting your parent. You can update it here."
  > [First name] [Last name]  [Looks good, continue →]
- **Save** — a small endpoint (or extend `/api/profile/confirm-role`) that writes the
  corrected `full_name`, sets `display_name_confirmed = true` + `display_name_confirmed_at = now()`.

**Source:** "BrainScribe — COPPA Consent Email Updates" doc, Change 9. (Changes 1–7,
the email rewrite + reply-to, already shipped 2026-06-21. Change 8 = DNS/SPF/DKIM/DMARC,
a manual GoDaddy/Resend task.)

---

## Other deferred items
(See `TESTING.md` → "Known deferred" for the full list.)
- Coaching-session redesign (iMessage bubbles, split/stacked toggle, "Working on" context bar) — intentionally not applied; existing session preserved.
- Desktop split↔stacked layout toggle in the coaching session.
- "New assignment" while remoted-in (create *as* the student) — create currently attributes to the logged-in admin.
- Teacher feedback-count bubble + teacher roster picker / remove-teacher — no backend yet.
- Free-sessions usage meter — built behind `SHOW_USAGE_METER=false`.
