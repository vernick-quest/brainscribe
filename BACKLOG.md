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

**⚠️ MOSTLY FREE — do not defer this as an expensive job. It splits three ways, and the
tier that would have caught Sierra costs nothing.**

**Tier 1 — free, deterministic, no model.** The entire failure chain is pure functions:
build a `[DONE:body:<700 words>]` payload, cut it at a token boundary, assert the client's
`tokenRE` parses ZERO locks, and assert `hadLockToken` returns TRUE on the same string —
which pins the counter bug. Same for newline survival through the payload, scaffold-size
arithmetic, and provenance scoring long student prose. **This is most of the value and it
should have existed.** Milliseconds, no API key.

**Tier 2 — Fable on the Claude Code subscription, as AUTHOR not tester.** Generate the
fixtures: a ten-scene outline, a 700-word scene in a 13-year-old's voice, the pushback
turns. Committed once. The repo is public so fixtures must be synthetic anyway — this is
the right way to get them. No per-run cost.

**Tier 3 — billed API, and genuinely unavoidable.** THE COACH CANNOT BE FABLE: `/api/tutor`
runs `claude-sonnet-4-6` through `ANTHROPIC_API_KEY`, and swapping in a subscription model
tests a different system. But what actually needs it is narrow — the JUDGMENT questions:
does the coach emit `[SCAFFOLD:narrative:10]` rather than `:1`, and does it stop asking
when a student signals readiness. Those are two targeted `npm run test:prompts` probes at
roughly a CENT each, not the $25–35 essay funnel.

Reserve the funnel for end-to-end behaviour across a whole session. Log spend via
`scripts/redteam/lib/logUsage.mjs`; a low API balance downs the live coach for everyone.

Sizing note: high-school work is the target market, and high-school work is long. The
ceiling was raised to 4000 today, which buys headroom rather than removing the class —
a long enough section exceeds any number.

## P0 — Locking by reference: remove the coach's echo from the save path

Full spec: **`SPEC-lock-by-reference.md`** (repo root — `docs/specs` is gitignored, and the
lanes need to read this). Approved by Robert 2026-08-16, not started.

Every token ceiling in the app currently bounds THE STUDENT'S WRITING, not coach verbosity,
because saving requires the coach to retype their words inside `[DONE:id:…]`. Six ceilings
were raised on 2026-08-16 and all six are workarounds — a long enough section beats any
number, and high-school work is long.

**The stronger reason is authorship.** While the coach retypes, it can alter. Rule 23 exists
because that already happened in production. A reference cannot be changed in transit, which
turns the product's central promise from a rule the model follows into a property of the
system.

Two mechanisms, because the locked text is not always text the student typed: bare
`[DONE:id]` for dictation (the client already holds the scribed text), and an anchored span
`[DONE:body:"first words"…"last words"]` for typed or pasted prose. **The model already
produces the anchored form unprompted** — it did so in the incident, on its own retry, after
the full echo was cut.

⚠️ Interacts with Lever B: referenced locks have novelFraction 0 by construction, so the
provenance scorer stops carrying signal for them. Correct, but the threshold work must not be
calibrated on a mixed corpus.

## P0 — The prompt still says a scaffold cannot grow  🔴 added 2026-08-17 · BLOCKS SIERRA
**Owner:** `focus/coach-ai` (needs the `coach-prompt` skill + `npm run test:prompts`).

Scaffold growth shipped and **the coach does not know it exists.** `lib/prompts.js` states in
three places that the count cannot be increased, and all three are now false:

- **312** — *"the paragraph count CANNOT be increased later (there is no token that adds a
  section…). Never promise you can add one later; you cannot."*
- **444** — *"the count is fixed for the whole session, and it cannot be changed later"*
- **455** — *"The paragraph count is fixed for the session (Rule 2), so do not promise to add
  a section"*

Until this lands, growth is **student-button-only** and growing a session produces sections
the coach refuses to move into and will actively tell the student cannot exist. That is worse
than not growing it: the student gets visible evidence the app contradicts itself. It also
means the one live case (Sierra, ten scenes in a 1-section scaffold) cannot be unblocked.

**Generalise it.** A capability shipped in one lane while another lane's prompt still denies
the capability is a class of bug, not an incident — the prompt is the coach's model of what
the app can do, and it drifts silently because nothing type-checks prose. Any change that
adds or removes a token or a structural affordance must grep `lib/prompts.js` for the
now-false claim in the same change.

## P0 — Flip narrative growth to custom "Scene N" — TWO parts, not one line  🔴 2026-08-17
**Robert approved the flip 2026-08-17.** Owner: `focus/coaching-session`. Do NOT ship part 1
without part 2.

**Part 1 (trivial):** `growthTypeFor('narrative')` → `'custom'`, with `Scene N` labels
instead of the `Part N` default. Stops every appended scene carrying its own `closing`, so
the student is not handed a second ending. Already exposed and tested via `opts.type`.

**🔴 Part 2 (the blocker the verification pass found).** `components/TutorSession.js:3440`
renders, for ANY custom section whose items are all confirmed:

```js
para.type === 'custom' ? (
  <button onClick={() => markSessionComplete(scaffoldRef.current ?? scaffold)}>
    Lock in all parts
  </button>
) : ( <button …>Assemble paragraph</button> )
```

That button **ends the whole session**, not the section. The assumption is sound today —
every custom scaffold is a SINGLE-section form (a haiku, a poem, the FTUE hook), where
"lock in all parts" genuinely means "I'm done." Flipping narrative growth to custom breaks
that assumption: a ten-scene story would show "Lock in all parts" on scene 2, and tapping it
would mark the entire assignment complete.

Consequences if shipped as one line: her session goes `status='complete'`, which (a) is the
watcher-facing record and the integrity baseline, (b) makes `/api/scaffold/[id]/grow` return
409 `session_complete`, so she cannot add scene 3, and (c) sends her to "Keep working on
this" — a v2 — for what should have been a section advance.

Part 2 must make the custom-section action per-SECTION for a multi-section scaffold
(confirm the section, emit `[PARA_DONE]`, advance the cursor) and keep whole-session
completion only for a single-section custom form. ⚠️ This touches the live writing UI and
the scaffold write path, so per CLAUDE.md it needs an adversarial pass before merge.

**Until both land, the narrative-inherits-narrative default is correct and safe** — a
student can grow and keep writing today. The flip is an improvement, not a fix.

## P0 — Growth gives a STORY essay-shaped sections  ✅ DONE 2026-08-17 (b72a94f)
**Owner:** `focus/coaching-session` (`lib/scaffoldGrowth.js:96`).

```js
const type = opts.type ?? (last?.type === 'custom' ? 'custom' : 'body')
```

Anything that is not `custom` normalises to `body`, so a `narrative` section grows into
`['topic_sentence','evidence','analysis','transition']`. Verified by running
`growComponents` against Sierra's real stored shape:

```
section 0  type=narrative  items: hook, context, body, closing
section 1  type=body       items: topic_sentence, evidence, analysis, transition
```

**Growth was built for Sierra and does the wrong thing for Sierra's own scaffold.** She taps
"+ Add another section" for scene two and gets an essay body paragraph.

The existing reasoning is right for the essay ladder and only for it: inheriting the last
type on a finished essay would append a SECOND conclusion, so introduction/body/conclusion
must normalise to `body`. **`narrative` and `personal_statement` are not part of that
ladder** — their sections are all one type by design, so they should inherit themselves.

Fix: normalise only the essay ladder; inherit `narrative`/`personal_statement`. Consider
`custom` with "Scene N" labels for narrative, which is what the file's own comment says a
scene-per-section story wants ("each scene locks and assembles on its own instead of every
scene piling into one container until it hits the ceiling") — that is a product call, but
essay slots in a story is a bug either way. Needs a test asserting a grown narrative section
is scene-shaped, using Sierra's shape as the fixture.

⚠️ Also re-examine the `closing` position question with this in mind. I said the
conclusion-lands-after-the-new-paragraph problem "hits the essay case more than the story
case." That was wrong: her narrative section carries a `closing` slot with 152 confirmed
words, so append-only growth puts an ending mid-story for her too.

## P1 — The UI calls every assignment an "essay", including a short story  🔴 added 2026-08-17
**Found by Robert, 2026-08-17**, asking what "Assemble paragraph" means on a narrative.

`components/TutorSession.js` hardcodes essay vocabulary regardless of assignment type:
"add it to **my essay**", "Assemble **full essay** →", "ready to assemble the full essay".
Sierra is writing *a short story about a squirrel litter*. The coach prompt already knows
narrative from argument (`[SCAFFOLD:narrative:N]`); the UI does not.

This is not cosmetic. A student writing a story is being told, by the interface, that the
thing she is making is an essay — and "paragraph" carries essay structure (topic sentence,
evidence) that a scene does not. **The vocabulary should follow `scaffold.type`**: story →
scene / story, essay → paragraph / essay. Do it with one resolver, not scattered ternaries.

## P2 — Remote-in is read-only; support cannot unstick a student  🔵 added 2026-08-17
**Robert, 2026-08-17:** *"should I remote in and click assemble paragraph for her? I know
remote in doesn't allow that yet, but this is potentially a reason to have that ability."*

The need is real: a student blocked by OUR bug currently has no path but to wait for a
deploy. But a write-capable impersonation is a serious surface — it makes an adult's action
indistinguishable from the student's own work, in a product whose central promise is that
the student wrote it. Non-negotiable constraints if it is ever built:

- **Attributed.** Every impersonated write stamped with the acting admin, stored on the row,
  not just logged. `[[revisionRefused]]`-style "recorded but never surfaced" is not enough.
- **Visible to the family.** A parent/teacher reading the transcript must see that an admin
  acted, and when. Silent staff edits to a child's writing is the wrong default forever.
- **Reversible.** Never the only copy. The action must be undoable from the record.
- **Narrow allowlist.** Structural repairs (grow a scaffold, re-run an assembly) — never
  authoring, never `[DONE:]`, never anything that puts words in a student's mouth.

⚠️ Note what it would NOT have solved on the day it was requested: pressing Assemble for
Sierra would have produced one 1,200-word paragraph AND self-cleared her critical
`no_draft_despite_locks` finding, turning the panel green with the real problem untouched.
The tool was not the blocker; the prompt was. Weigh that before building it.

## P1 — A prompt probe still enforces the DELETED "count is fixed" rule  🔴 2026-08-17
**Owner:** `focus/coach-ai` (owns the harness probes). Found by the conductor while running
`test:prompts` on the integrated tree.

`scripts/prompt-harness/oversized-lock.mjs:199`:

```js
check('P4: does not promise to add a new section (Rule 2: the count is fixed)',
  !/\b(?:add|create|make|open|set up) (?:a |an |one )?(?:new |extra |another |...)(?:paragraph|section|scene|slot)\b/i.test(p3))
```

Rule 2 no longer says the count is fixed — it now carries ADDING A SECTION LATER, and two
probes in `scaffold-growth.mjs` assert the coach DOES offer it and names the button. This
assertion encodes the superseded contract.

**It passes today**, so nothing is broken right now — in that scenario the coach happens not
to offer growth. The hazard is future and it is the bad direction: **a correct prompt change
that made the coach offer a section here would be REJECTED by a green-looking safety probe.**
A test that fails on right behaviour is worse than no test, because the natural response is
to weaken the prompt until the suite goes green.

Not fixed in place, deliberately: deciding what it should assert instead is a coach-behaviour
call, not a rename. The probe's real purpose is "never split one passage across two locks";
"don't promise a new section" was a proxy for "don't invent structure you cannot create,"
which is no longer true. Likely replacement: *if* it mentions adding a section, it must name
the button — matching `scaffold-growth.mjs` P1/P4 — and the split-lock assertions stay
untouched.

⚠️ Same family as the drift coach-ai already fixed once today (the probe's private
over-claim regex had diverged from the shipped guard). Worth one sweep of every probe
assertion against the CURRENT prompt rather than waiting to trip over the next one.

## P1 — The Warnings column must be THE call-to-action  🔴 added 2026-08-17
**Robert, 2026-08-17:** *"any warnings that need my attention should get flagged here, this
is a CTA for me."* Owner: `focus/admin`.

Today the ⚠ column counts **only guardrail-audit findings** — the coaching-quality judge.
The mechanical "student work at risk" findings live in a separate red panel on the Audit
tab, so **Sierra can carry a CRITICAL `no_draft_despite_locks` and render a dash** on the
roster row. That is how her problem needed a remote-in to find in the first place.

Treat the column as a promise: *if something here needs Robert, it appears in this number.*
That makes it a design rule, not a one-off fix — every future detector has to declare
whether it feeds this column, and the default must be yes.

In scope now: guardrail-audit findings + session-health findings (`no_draft_despite_locks`,
`truncated_turn`, `overstuffed_section`, `late_scaffold`) + `lock_over_claims` +
`revisionRefused`. Severity should dominate the count — one critical outranks five mediums,
and the colour must reflect the worst, not the newest. Clicking should land on the finding,
not on the tab.

⚠️ Do not let this become an over-count that gets skimmed. Precedent: the transcript-audit
sampler's over-flag rate went 37% → 7% before it was trustworthy, and a noisy CTA is worse
than a quiet one because it trains the reader to ignore it.

## P1 — `revisionRefused` is recorded but nothing alerts on it  🔴 added 2026-08-17
**Owner:** the `draftIntegrity` file's owner. Surfaced by `focus/coaching-session`.

The crossSection no-overwrite guard stamps `revisionRefused` on the row when it refuses. The
fact is durable and nothing reads it, so a refused write is invisible on every dashboard —
the exact half-finished shape ("recorded, never surfaced") that lets a signal look healthy.

## P1 — The coach gets no feedback when a write is refused  🔴 added 2026-08-17
**Owner:** `focus/coach-ai`. Surfaced by `focus/coaching-session`.

The described recovery — "retry with the cursor on that section" — **cannot happen**: there is
no signal to retry on. The refusal is server/client-side only. Needs a note back to the coach
and/or a Rule 11 / `[THESIS:]`-mandate change. A guard the model cannot observe converts a
destructive bug into a silent stall, which is better but is not the intended behaviour.

## P2 — "Never checked" is inferred from zero findings, not recorded  🔵 added 2026-08-17
**Owner:** `focus/admin`. Follow-on to the false-all-clear fix (shipped `b3e9292`).

`everRun` is derived as `rows.length > 0`. That closes the false all-clear, but it is
directional: once the corpus is genuinely healthy and the pass legitimately writes zero rows,
the panel will say **"Not checked yet"** forever and can never report a true all-clear. Safe
direction, still wrong. The durable fix is a recorded run timestamp (a `health_runs` row, or a
single-row `last_run_at`), not inference from the findings table. Low urgency: no session is
currently clean enough to hit it.

## P2 — Persist the over-claim magnitudes  🔵 added 2026-08-17
`record_lock_over_claim(p_session_id, p_claimed, p_emitted)` (migration 070) **accepts
`p_claimed`/`p_emitted` and stores neither** — deliberate and documented in the migration, and
the numbers live in the route's `console.error` alongside the offending sentence. Worth
persisting so admin triage can answer "how bad" without reading a transcript. The signature
already has room; no call-site change needed.

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

---

## P1 — `resolveComponentWrite` returning `null` stamps nothing, so the integrity layer is blind
**Found 2026-08-17, adversarial pass on the narrative-growth flip.**

When a cross-section write targets a section that is already assembled,
`lib/scaffoldWrite.js` refuses and returns `null`. That refusal is correct — writing the
scaffold alone would show the student a revision the Final Draft never receives. But the
`[DONE:]` handler's `if (doneTarget)` then skips the whole update, so **nothing is recorded
anywhere**:

- `writeDropped` — never set (the token carried inline text, so `resolveDoneText` never ran).
- `revisionRefused` — never stamped; `preserveExistingItem` is on the other branch.
- `reconcileCommitments` — matches on **id alone**, so a promise whose id is filled in the
  *other* section reads **KEPT**. The one signal documented as "a FACT rather than an
  inference" reports success.
- `checkDraftIntegrity` — `severity: none`.

Verified by running the detectors on the post-loss state. The narrative-growth shape no
longer reaches this path (a prose name on a custom section now resolves locally), but the
class is real for any scaffold where a cross-section id lands on an assembled section.

**What it needs:** a refusal record that does not require knowing where the words belong —
somewhere the audit layer can read "a `[DONE:]` was refused and its payload is not in the
scaffold". Deliberately not bolted onto the growth change: this repo's history is that a
safety net added at the end of someone else's change is where the next loss comes from.

## P2 — The coach sees `c1: queued` with no hint it is "Scene 2"
`lib/prompts.js` `componentSummary` (~:928) prints bare item ids. Prose ids are
self-describing (`hook`, `thesis`); a grown story's are positional. Include `label` for
custom sections. Low risk, and it is the cheap half of keeping the coach aimed at the right
component on a scene-per-section story. `npm run test:prompts` has NOT been run against the
grown-story shape — how often the coach mis-names on it is **UNVERIFIED**. (coach-ai lane.)

## P2 — Two tabs that each grow once clobber each other
`reconcileComponentsWrite` carries the stored tail across only when the incoming array is
**shorter**. Two tabs that each grew by one produce **equal**-length arrays, so the guard
passes them through untouched and the second write wins, discarding the first tab's section
and anything in it. Pre-existing; out of scope for the flip but the same family as the
stale-shrink guard it sits next to.

## P3 — `needsProvenancePass` never settles for a completed custom section
A custom section marked `complete` has no `paragraphs` row until session completion, so
`lib/scaffoldProvenance.js` scores it `unscorable` and stores no record — meaning
`needsProvenancePass` returns true on **every** subsequent scaffold PATCH for the life of the
session (3 extra queries + a full provenance pass per lock, plus a `NOT SCORED (no scribed
text)` warn per scene). Shadow mode, so it costs latency and log noise rather than
correctness. (Lever B's file.)
