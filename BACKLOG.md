# BrainScribe — Backlog

Deferred features and improvements, with enough detail to pick up cold.

---

# PRIORITIZED — added 2026-08-05, out of the six-drop-path incident

## P0 — Move the prompt harness into the repo
**Why:** It lives in a scratchpad under `/private/tmp`, which gets swept. The thing that
finally caught two unverified prompt changes is one cleanup away from not existing.
**Build:** `scripts/prompt-harness/` + `"test:prompts"` in package.json. Four scripts already
exist and work — parse-vs-worksheet, coach first turn, the "???" fabrication replay, the
warm-up redirect. Each builds the prompt FROM SOURCE so it tests what ships. Fixtures
committed but **SYNTHETIC ONLY** (this repo is public). Key from `.env.local`. ~4s, ~$0.01.

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
