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

## PARKED — Lever B Phase 2: enforce provenance at lock time  ⏸ 2026-08-11

**Deliberately deferred, not forgotten.** Phase 1 (shadow: annotate, never block) is live and
now instrumented. Phase 2 would flip `checkProvenance` from annotating a lock to REFUSING it.

An adversarial review (two independent passes, 2026-08-11) established that **the threshold
is not the blocker.** Three things must be fixed before the collected data means anything,
and two of them make Phase 2 bypassable at *any* threshold.

### 🔴 BLOCKER 1 — the baseline is missing whole categories of the student's own writing
`studentSources` is only `paragraphs.raw_spoken_text` + `messages` where `role='user'`
(`app/api/scaffold/[sessionId]/route.js`). Verified false-positive rates on real shapes:

| The student did this | novelFraction | Verdict |
|---|---|---|
| Dictated; scribe fixed irregulars (`childs`→`children`, `feeled`→`felt`) | **0.43** | FAIL |
| Typed with ordinary misspellings (`goverment`, `enviroment`) | **0.75** | FAIL |
| Wrote the answer on an uploaded worksheet (lives in `assignment_text`) | **1.00** | FAIL |
| Dictated cleanly | 0.00 | pass |

The header of `lib/provenance.js` claims ESL-safety because it ignores function words and
regular inflections. **That claim does not hold**: irregular plurals, irregular past tense and
spelling corrections all read as coach vocabulary — and they are produced most by the
youngest and ESL writers, the students the check says it protects. Also missing from the
baseline: typed direct edits (never persisted as messages), quoted sources from Research &
Citations, and — on a v2 continuation — every message turn from v1, since `sessionContinuation`
copies paragraphs and scaffold but no messages.

These are not edge cases. **Every one lands in `provenance_checks` as a `passed=false` row**,
so the dataset Phase 2 will be calibrated from is being seeded with fabricated failures.

### 🔴 BLOCKER 2 — edit-after-lock is never re-scored
`saveComponentEdit` writes replacement text with `status:'confirmed'`; the stored record is
carried forward without comparing text. Lock an honest version, then paste anything — never
re-checked. Under Phase 2 that is a complete bypass, and it needs a design decision, not a
patch: re-score on text change, and decide what happens when a re-score fails on text a
student has already been told is theirs.

### 🔴 BLOCKER 3 — what does Phase 2 DO with a lock it cannot score?
Nothing decides this today. Allow → strip the text client-side and bypass enforcement.
Block → one transient paragraph-save failure locks an honest student out of their own work.
The whole provenance pass is also fail-open on any throw; inverting that to fail-closed
blocks honest locks on a transient DB error. Pick deliberately, and write down the reasoning.

### The indicator — do not flip until ALL of these hold
1. **Blockers 1-3 fixed**, and the data re-collected *after* the fix. Rows written before are
   contaminated and must be excluded, not merged.
2. **≥200 rows at `kind='paragraph'` from ≥10 distinct students**, post-fix. Paragraph locks
   are what is worth enforcing; a confirmed 3-word hook is not.
   `select kind, count(*), count(distinct student_id) from provenance_checks group by kind;`
3. **Separated distribution, banded by `content_count`, never pooled across `kind`.** Plain
   "failures above the threshold" is tautological — failures are *defined* by the threshold.
   The real test: within a content-count band, does the passing population sit clearly below
   the failing one, or do they overlap? Overlap means the threshold punishes honest students
   at some rate, and that rate is the number to argue about.
4. **Zero unexplained `NOT SCORED` lines.** Enforcing on a monitor with holes blocks arbitrarily.
5. **The short-lock floor fixed.** Every would-be block observed so far is 2-3 content words,
   where novelFraction quantises brutally (1 novel word of 3 = 0.33) and the
   `novelWords.length <= 1` escape does not save a 3-word line with 2 novel words. Note that
   same escape passes 1-word locks at novelFraction 1.0, so the passing distribution has a
   spike at 1.0 that will wreck condition 3 unless banded.
6. **A student-facing refusal that does not accuse a child of cheating**, and a decision on
   what a blocked lock DOES (retry? re-voice? coach hand-off?). A silent refusal is the worst
   outcome available.

### On the backfill — it is NOT the unlock I claimed
Scoring the existing 30 paragraphs + 74 items retroactively cannot satisfy condition 2: 30
paragraph rows is 6.7× short of 200. Worse, locks carry no timestamp, so a backfill must
score against the END-OF-SESSION baseline while live enforcement scores at-lock — systematically
lower novel fractions, i.e. **a threshold tuned on backfill is too tight for real students.**
Add survivorship bias (COPPA 7-day deletion has already removed under-13 rows, the highest
false-positive population) and contamination from admin/test and `seed-demo` sessions.

A backfill is still worth running as a **qualitative** exercise — read the 3 current failures
and ask whether they are real — but it is not evidence for a threshold. Say so out loud if
anyone proposes relaxing condition 2 after a backfill; quietly loosening the indicator once
the data disappoints is the self-confirming failure the indicator exists to prevent.

### Known lower-severity issues, all recorded not fixed
- `after()` runs even when the response failed, so a failed scaffold upsert still writes
  `provenance_checks` rows for annotations that were never persisted; the state predicate then
  re-scores on the next PATCH and inserts duplicates, possibly with a *different* verdict
  (the baseline grew in between). No unique constraint prevents it. Same duplication from two
  racing PATCHes.
- `/api/paragraphs` still attributes `student_id` to the acting user, so admin remote-in rows
  carry the admin's id. The scaffold path was fixed to use the session owner; the two paths
  now disagree inside one table, and condition 2 counts distinct students.
- Thesis checks remain log-only and unpersisted — a third silent-monitor shape.
- `/api/messages` writes are fire-and-forget with no `res.ok` check, so a dropped turn
  silently removes words from the student's future baseline. Same class as the three
  fire-and-forget writes already found in this repo.
- `p.index ?? i` keying collides if a stored entry lacks `index`. Not constructible from
  current client code (every creation site sets `index` = array position), but it is a
  landmine for any future add/remove-component feature.

**Do not read "shadow mode" as "safely watching."** For weeks it recorded nothing at all on
dictated paragraphs and looked identical to having nothing to report.

## P0 — Engage COPPA counsel  🔵 AWAITING ROBERT · flagged 2026-08-16

**There is no legal counsel engaged.** Every COPPA judgment in this repo to date is a
careful reading by non-lawyers, and two of them are load-bearing for a pre-launch product
serving under-13s. Decisions were made on best understanding (2026-08-16, Robert's call)
so work could continue; this item is the debt that creates.

**The specific questions to put in front of counsel**, all written up with facts in
`COPPA-WAITLIST-REVIEW-2026-08-16.md`:

1. The marketing/waitlist form collects an email with **no age screen**. Is the
   parent-directed posture (`docs/specs/brainscribe-coppa-marketing-posture-2026-07.md`)
   sufficient, or does the form need one?
2. Does the one-time-contact exception (16 CFR 312.5(c)(3)) cover the acknowledgment
   email, given the copy promises a later second contact?
3. Does 312.5(c)(4) apply where there is **no parent anywhere in the flow**?
4. Is the retention window we picked (below) defensible?
5. Non-US minors: COPPA is US law and the waitlist has an `.ed.jp` address. GDPR-K /
   Japanese APPI were never scoped.
6. Separately, and older: the **parent-first under-13 flow** (migration 055) has had
   "counsel review OPEN" against it since 2026-08-02 and has never been run end-to-end
   live. See [[brainscribe-parent-first-coppa]].

**Not blocking anything today.** Volume is three addresses; nobody on the list is known
to be a child. This is a "before launch" item, not an incident — but it is P0 because the
cost of being wrong scales with the first real cohort, not with today's three rows.

## P1 — School-filter access: NDPA + vendor categorization  🔵 ROBERT OWNS · 2026-08-16

Neither of these is a code task, which is why neither has a lane. Both are things only
Robert can do — one is a document exercise, the other is browser forms behind logins and
CAPTCHAs. Recorded here so they stop living in a chat scroll.

**Context that makes them urgent-ish:** Securly, GoGuardian and Lightspeed are all
**customer-gated** — there is no site-owner submission path (see
[[brainscribe-firewall-categorization]]). You cannot form-fill your way out of a school
block. The unlock is one friendly district admin, who can both allowlist immediately and
submit the recategorization from inside the portal, which then updates the vendor's shared
database for every other district.

### 1. Get NDPA-ready
The **National Data Privacy Agreement (NDPA v2)** from the Student Data Privacy Consortium
(`privacy.a4l.org/national-dpa`) is the standard K-12 procurement instrument — 275,000+
executed since 2016. A district IT admin will ask for a signed DPA before allowlisting
anything, so this gates every school conversation after the first hello.

⚠️ **Depends on the P0 counsel item above.** A DPA is a contract; signing one on a
best-understanding reading is a different risk class from writing a privacy policy on one.
Do the document prep now, sign nothing until counsel has looked.

Adjacent, cheaper, and worth doing in the same pass: a **Common Sense Privacy** listing
(`commonsense.org/education/privacy-direct`) and the **1EdTech App Vetting Rubric**.

### 2. Confirm the seven general-vendor submissions ever happened
The 2026-07-13 playbook (Talos · Palo Alto · Zscaler · Blue Coat · Forcepoint · FortiGuard ·
Trellix) was **prep-only, and no submission was ever recorded**. Per-vendor URLs, the exact
category to request, and the ⚠️ "do NOT let us be filed under AI/Generative-AI" strategy
are all written up in [[brainscribe-firewall-categorization]] — it is an afternoon, not a
project. Many districts run one of these UPSTREAM of the school-specific filter, so a block
today may not be coming from Securly at all.

### The marketing-lane piece, which is real but downstream
A **`/for-schools` page** aimed at district IT: what to allowlist (including the
ElevenLabs/Anthropic endpoints a filter might also stop), what data is collected and how
long it is kept, COPPA/FERPA posture, DPA availability. Filter vendors and district admins
both look for exactly that page, and its absence reads as "consumer app". That IS
`focus/marketing` — but it must state retention and privacy accurately, so it lands AFTER
the privacy pass, not alongside it.

## P1 — Simulate the LONG-FORM student with Fable  🔴 2026-08-16

**Nothing in the test suite writes anything big.** Every fixture is short, every probe is a
few sentences, and 570 unit tests say nothing about what happens when a student hands the
coach 700 words at once. Sierra's truncation was found by a human reading a transcript —
which is the detection method this repo keeps proving is the last line, not the first.

**What it would have caught, before a real student hit it:** a `[DONE:id:…]` payload
carrying the student's exact words blew `max_tokens: 1000`, the token never closed, the
client's `tokenRE` (which requires the closing bracket) parsed ZERO locks, and ~30k
characters never reached `paragraphs`. Every link failed quietly.

**The sim:** drive a full session as a prolific writer — a multi-scene narrative, a
research essay, a student who pastes an existing draft — and assert on the ARTIFACT, not
the transcript reading nicely:
- every `[DONE:]` payload parses (opens AND closes) — the exact failure above
- `paragraphs` rows exist and their text matches what the student sent, byte for byte
- paragraph and dialogue breaks survive the payload round-trip
- `truncated_turns` stays 0, and `truncated_turns_no_lock` is read only after the counter
  bug is fixed (`hadLockToken` matches the OPENING bracket; the client needs the closing
  one, so today it under-reports exactly this case)
- the scaffold gets the right NUMBER of sections for the work — scene-scaffolding is a
  one-shot turn-1 assessment and unrecoverable if wrong
- provenance scores the student's own long prose as theirs, not as coach-authored

**Existing infra to build on:** `scripts/redteam/` and `scripts/prompt-harness/`. The
harness runs the real prompt in ~4s for about a cent; a full session sim is a different
cost class.

⚠️ **BILLED. Estimate and get Robert's go before running.** A full essay-funnel run has
cost $25–35 before. Log spend via `scripts/redteam/lib/logUsage.mjs`. A low API balance
takes the live coach down for everyone, so this is never a background job.

Sizing note: high-school work is the target market, and high-school work is long. The
ceiling was raised to 4000 today, which buys headroom rather than removing the class —
a long enough section exceeds any number.

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

## P1 — The blog list has subscribers but no sender  🔴 added 2026-08-16

**The gap.** `components/NewsletterSignup.js` on `/blog` collects an address on the
promise *"We'll send new posts as they go up."* **Nothing sends them.** Grepped at
`f8fa522`: `sendWaitlistAck` and `sendWaitlistCode` are the only subscriber-facing
emails that exist. There is no post mailing anywhere in the codebase.

**Not yet harming anyone** — all three live `subscribers` rows are `source='waitlist'`;
there are zero blog subscribers (counted by auth-coppa, 2026-08-16). But a twice-weekly
Mon/Thu cadence restarted this week specifically to drive traffic, so blog-form signups
are about to start and the promise starts running with them.

**Two ways out. Both are fine; drifting is not.**
1. Build the sender (below), or
2. take the blog form down until it exists.

Deliberately NOT taken: softening the copy. "We'll send new posts" is what the form is
*for*; watering it down until it promises nothing would leave a form that collects
addresses for no stated reason.

**If it gets built, the shape — agreed with auth-coppa 2026-08-16:**
- **`List-Unsubscribe` (RFC 8058 one-click) + a working opt-out endpoint must ship WITH
  the first mailing, not after.** You cannot retrofit an opt-out onto people you have
  already mailed, and Gmail/Yahoo bulk-sender rules expect one-click. This is the one
  ordering constraint that cannot be fixed later.
- **Guard on `source`, mirror-image of the existing send-code guard.** `source` is the
  only thing separating a blog subscriber from an access request. `/api/subscribe`
  already scopes the ack to `source === 'waitlist'`, and `lib/waitlist.js`
  (`isAccessRequest`) guards the code path. A sender needs the opposite guard: never
  mail a post to someone who only asked for access. Cheap at build time, expensive to
  discover afterwards.
- **Exclude rows that are gone, dismissed, or Forgotten**, and honour Forget
  (`/api/admin/waitlist`, added 1a6f55d) immediately — otherwise we mail someone who
  asked to be removed.
- Retention interacts: see `lib/subscriberRetention.js`. A row can expire out from under
  a queued send.

**Related copy already fixed (24f05e6):** the success message said "unsubscribe anytime"
when the codebase contained exactly one occurrence of the word "unsubscribe" — that copy
string. It now names the real route (email us). That is a stopgap for a list nobody is
mailing, **not** a substitute for a real opt-out once mailing starts.

---

## Other deferred items
(See `TESTING.md` → "Known deferred" for the full list.)
- Coaching-session redesign (iMessage bubbles, split/stacked toggle, "Working on" context bar) — intentionally not applied; existing session preserved.
- Desktop split↔stacked layout toggle in the coaching session.
- "New assignment" while remoted-in (create *as* the student) — create currently attributes to the logged-in admin.
- Teacher feedback-count bubble + teacher roster picker / remove-teacher — no backend yet.
- Free-sessions usage meter — built behind `SHOW_USAGE_METER=false`.
