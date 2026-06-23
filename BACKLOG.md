# BrainScribe — Backlog

Deferred features and improvements, with enough detail to pick up cold.

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
