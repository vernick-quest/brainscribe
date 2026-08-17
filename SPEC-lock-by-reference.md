# Spec — Locking by reference

**Status:** proposed, not started · **Author:** conductor, 2026-08-16 · **Approved by:** Robert

Remove the coach's echo from the save path. Today, locking a student's writing requires the
coach to retype every word of it. This replaces that with a reference the client resolves.

---

## Why

### 1. Every token ceiling currently bounds the student's writing

`[DONE:id:exact words]` carries the student's text, so `max_tokens` on the coach turn is
not a limit on how much the coach may say — it is a limit on **how long a section of their
writing may be**.

On 2026-08-16 a student wrote a 685-word scene. The lock payload alone was ~950 tokens
against a 1000-token ceiling. The reply cut mid-word, the token never closed, the client's
parser requires the closing bracket, and **zero locks were parsed**. Not a partial save —
nothing. Twice. She pasted the same 700 words three times before it stuck.

Six ceilings were raised that day (tutor, paragraph assembly, scribe, essay assembly, gym
tutor, intake) and every one of them is a workaround. **A long enough section beats any
number**, and high-school work is long.

### 2. The stronger reason: echoing makes the coach the courier of the student's words

While the coach retypes, it can change them. Nothing structural prevents a locked line from
differing from what the student actually wrote — the only defences are an instruction
(Rule 23: *"every idea you attribute to the student must trace to something they ACTUALLY
SAID"*) and after-the-fact detection (the provenance scorer). Rule 23 exists because this
already happened: a coach put *"when Lincoln tried to resupply troops at Fort Sumter"* into
a student's mouth and he repeated it back as his own.

**A reference cannot be altered in transit.** If the lock names a span of the student's own
message and the client resolves it, the coach is physically incapable of putting words in
their mouth at lock time. That converts the product's central promise from a rule the model
follows into a property of the system.

---

## The two input paths

The design turns on a distinction that is easy to miss: **the text that gets locked is not
always text the student typed.**

| Path | What the student produced | What gets locked | Does it appear verbatim in `messages`? |
|---|---|---|---|
| **Dictated** | speech → `/api/scribe` | the **cleaned** `scribedText` | **No** — the scribe fixes spelling and filler |
| **Typed / pasted** | the message itself | their text | **Yes** |

So a single mechanism cannot cover both. Anchoring into `messages` fails for dictation,
because the cleaned text is not in there. Two mechanisms, one per path.

---

## Who cleans the text — the coach never did

Asked by Robert, and worth settling before anyone builds: if the coach stops retyping, who
strips the ums and ahs?

**Nobody loses anything, because cleaning was never the coach's job.** Verified against the
prompts:

| Stage | Component | Removes |
|---|---|---|
| 1 | ElevenLabs STT | filler words — *"Filler words have already been removed at the transcription layer"* (`lib/prompts.js`, scribe prompt) |
| 2 | `/api/scribe` (Haiku) | grammar, sentence structure, spelling, obvious typos, duplicate words |
| 3 | assembly | remaining spelling, plus transitions between components |

The coach's `[DONE:]` payload is meant to be the **already-cleaned** text — "exact final
words". So a bare `[DONE:id]` locking the scribe's output is byte-identical to what the echo
was carrying. The voice path is unchanged.

🔴 **And the inverse is a finding.** If the coach is quietly tidying as it retypes — fixing
a typo, smoothing a phrase — that is an untracked edit of the student's words by the one
component in the pipeline whose job is explicitly *not* cleaning, and it would appear
nowhere. Rule 23 exists for this. Referencing is **more** faithful than echoing, not less.

### Open decision: typed text is not cleaned before the lock

Dictation arrives cleaned (stage 2). Typed text does not — a student's raw message carries
their typos, and anchoring resolves to exactly that. The scaffold panel would show the typos
until assembly fixes spelling downstream.

Two options, to decide before build:

- **A — accept it.** Assembly already cleans into `paragraphs.scribed_text`, which is what
  the student and a teacher read as the Final Draft. The scaffold showing what they actually
  typed is arguably the honest rendering.
- **B — route typed passages through `/api/scribe` as well.** It is a cleaning service that
  happens to be named for speech, and its prompt already covers "spelling errors, obvious
  typos, missing apostrophes". Both paths would then produce a cleaned artifact the client
  holds.

⚠️ Option B does **not** remove the need for anchors. Those do SEGMENTATION, not cleaning —
when a student pastes 700 words, something still has to say which stretch is the hook and
which is the body. B changes what the anchors resolve *into*, not whether they are needed.

## Mechanism 1 — bare `[DONE:id]`, for dictation

The client already holds the scribed text when the coach decides to lock: `/api/scribe`
returned it, and it is sitting in the composer or as the slot's candidate.

    [DONE:hook]

means *lock the pending text the client already has for this slot*. No payload.

**Precedent exists.** The current handler already falls back to a prior `[NUGGET:id:text]`
when `[DONE:id]` arrives with no inline text. This makes that the primary path rather than
the fallback — and removes the echo from `[NUGGET:]` too, which has the same problem.

## Mechanism 2 — anchored span, for typed or pasted text

When the lock covers a stretch of what the student wrote themselves:

    [DONE:body:"One and Two hopped tentatively"…"gnawing off big chunks of nut."]

The coach emits the **first few words and the last few words**. The client resolves the
span from the student's own messages. Payload is ~15 words whether the passage is 60 words
or 900.

**The model already does this unprompted.** In the incident above, after the full echo was
cut, the coach's own retry read:

> *"The body section I need to lock is from 'One and Two hopped tentatively' through to
> 'gnawing off big chunks of nut.' Locking that in now: [PA…"*

It reached for anchors by itself when echoing failed. This is not a form we are imposing;
it is the one the model finds natural when the passage is long.

### Resolution rules — refuse rather than guess

The client resolves against the student's `role:'user'` messages, and **all** of these must
hold or the lock is refused with a visible error:

1. The start anchor matches **exactly one** position. Two matches → refuse.
2. The end anchor matches exactly one position, **after** the start.
3. Both anchors are in the **same message** (v1 — see open questions).
4. The resolved text is a **contiguous substring** of that message. Assert it; do not trust
   the resolution.
5. On any failure: refuse, log loudly, and tell the student plainly. **Never fall back to
   locking something approximate** — a wrong span is worse than a failed lock, because it
   looks finished.

Rule 5 is not negotiable. Six drop paths in this codebase destroyed writing, and every one
of them returned unchanged state with no throw and no log.

---

## What this changes

- **Payload size stops scaling with the student's writing.** Ceilings stop being a limit on
  how much a student may write in one section.
- **Tampering at lock time becomes structurally impossible**, not merely forbidden.
- **A truncated lock becomes far less likely**, because the payload is small — and the
  existing truncation guards still catch the remainder.

### Interaction with provenance (Lever B) — read before building

Locks resolved by reference have, by construction, a `novelFraction` of 0: the text came
out of the student's own message. That is *correct*, and it also means **the provenance
scorer stops carrying signal for those locks** — it will be measuring something it can no
longer be wrong about.

That is not a reason to avoid this design; preventing a problem beats detecting it. But
Lever B's threshold work must not be calibrated on a mixed corpus of echoed and referenced
locks, because the two have completely different distributions. Whoever builds this must
tell the Lever B owner, and referenced locks should be identifiable in the record.

---

## Rollout

Additive, in this order. Nothing here is a flag day.

1. **Client accepts the new forms** alongside the existing inline payload. Both work.
2. **Tests first** — the resolution rules above are pure functions and belong in `lib/` with
   a test file before any prompt changes. Include the ambiguous-anchor and
   anchor-out-of-order cases; those are where a wrong span comes from.
3. **Prompt teaches the new forms** (`coach-prompt` skill, then `npm run test:prompts`
   against the real model — prompt changes are code, and two shipped unverified before that
   harness existed).
4. **Measure.** The share of locks using each form is the adoption signal; the session
   health pass (`focus/admin`) is the regression signal.
5. **Deprecate the inline payload** only once referenced locks dominate and nothing has
   regressed. Old sessions keep old payloads forever — the parser must never stop reading
   them.

## Verification

- A 900-word passage locks with a payload under ~30 tokens. This is the whole point; assert
  it directly.
- An ambiguous anchor refuses rather than locking the first match.
- A resolved span is byte-identical to a substring of the student's message.
- Reload mid-session: mechanism 1 depends on client state, so a refresh must not silently
  lose a pending candidate — it should refuse, not lock the wrong thing.
- 🔴 **Adversarial review before merge.** This touches the scaffold write path and the
  token contract, the two most dangerous surfaces in the repo.

## Open questions

- **Multi-message spans.** A student who writes across three turns cannot be covered by
  rule 3. Options: allow a span across consecutive user messages, or require the coach to
  lock per message. v1 should refuse and see how often it happens.
- **Revisions.** If a student edits after locking, anchors may no longer resolve. Locks
  store resolved text, so existing locks are unaffected — but a *re-lock* may fail. Decide
  whether re-locking re-resolves or reuses.
- **`[NUGGET:]` carries the same echo** and should follow, but it is a candidate rather
  than a save, so it is lower risk and can lag.
- **Does the student ever see the anchors?** They should not. This is plumbing, and Rule 24
  already forbids narrating plumbing.

## Lanes

Token contract and prompt: `focus/coach-ai`. Client resolution and the write path:
`focus/coaching-session`. They must land together — a prompt that emits a form the client
cannot resolve silently breaks every lock.
