# Spec — The starting draft

**Status:** proposed, not started · **Author:** conductor, 2026-08-17 SF · **Approved in principle:** Robert

Let a student declare what they arrived with, keep it immutable, and make everything after
it measurable growth.

---

## Why

### 1. The paste is already happening — it is just unmanaged

On 2026-08-16 a student pasted ~700 words of an existing story into the chat composer three
times. Nothing in the system knew that text was pre-written. It became scaffold components
indistinguishable from words the coach had drawn out of her turn by turn.

That is the status quo, not an edge case: **a student who arrives with a draft has exactly
one way to bring it in, and it is a channel we do not model.** Capturing it explicitly does
not open a door — it puts a frame around a door that is already open.

### 2. It is the baseline the product does not have

BrainScribe's central claim is that the student did the writing. Today that claim rests on
process (the coach never composes) and on after-the-fact scoring (`lib/provenance.js`). What
is missing is a **before**.

With a declared starting draft, a parent or teacher can be shown:

> *"Here is what she arrived with. Here is what she has now."*

That artifact does not exist today and cannot be reconstructed. It is also the clearest
answer to "what am I paying for" — growth, attributable, in the student's own words.

### 3. Robert's framing, which reversed the conductor's objection

The conductor initially argued against a free-form writing space: it inverts the Socratic
interaction and weakens "can't cheat." Robert's counter — *"kids can start with something
they have already written… show them where they started and then keep the working draft as a
space"* — dissolves both objections, because a **declared** starting point is a baseline
rather than a bypass, and the coach stays upstream of everything new.

⚠️ Note what this is NOT: it is not a fourth space. The draft space already exists (scaffold
plus assembled paragraphs). This makes that the writing surface instead of asking the chat
composer to carry a story.

---

## The one property everything depends on

**The starting draft is an immutable snapshot.** If a student can edit it in place, there is
no "before", the growth artifact is fiction, and the objection above returns in full.

Immutable **by construction, not by discipline** — the same reasoning as
`/api/scaffold/[id]/grow`, where the client sends a count rather than an array so a
destructive write has no wire representation:

- Its own table, one row per session, **INSERT and SELECT only**. No UPDATE or DELETE grant
  for `authenticated`. A revision is not representable, so it cannot be a bug.
- Written once, at creation. A second insert for the same session must fail loudly on a
  unique constraint, not silently no-op.
- Never fed back into any editor.

## Schema — migration 071

⚠️ Re-derive the number at merge with `select max(version) from public.schema_migrations` —
head is 070 today, and a lane's number can be stale by the time it lands (that happened on
2026-08-17: authored as 069, merged as 070).

```
session_starting_drafts
  session_id   uuid primary key references sessions(id) on delete cascade
  content      text not null
  word_count   integer not null
  source       text not null check (source in ('typed','pasted','upload'))
  created_at   timestamptz not null default now()
```

- **`on delete cascade` is load-bearing.** This is a child's writing; the under-13 7-day
  auto-deletion (`/api/cron/coppa-cleanup`) deletes the session, and this must go with it.
  Verify that explicitly — do not assume the cascade fires.
- `word_count` stored, not derived, so the growth number never depends on re-tokenising.
- RLS: student may INSERT and SELECT their own; watchers (parent/teacher via `relationships`)
  may SELECT; **nobody may UPDATE or DELETE.** Assert the denial with a live check on a
  planted row — a `200 []` read proves nothing (see CLAUDE.md verification discipline).

## Capture — v1 is intake only

At session creation, after the assignment step: *"Have you already started writing this?"* →
a paste/upload field. Empty is the common path and must stay one tap away.

**Out of scope for v1: adding a starting draft to a session that already has confirmed
components.** Once locks exist, a "starting" draft is no longer a baseline — it is a
mid-stream paste, which is a different thing and needs its own product decision. Refuse it
with a clear message rather than accepting it into the wrong frame.

🔴 **This therefore does nothing for Sierra's current session.** Her 1,227 words are already
locked. Say so plainly rather than implying the feature reaches her — she is the case that
motivated it and the case it cannot retroactively serve.

## 🔴 It must enter `studentSources` in the same change

`app/api/scaffold/[sessionId]/route.js:139`:

```js
const studentSources = [
  ...(paras ?? []).map(p => p.raw_spoken_text),
  ...(msgs ?? []).map(m => m.content),
]
```

A starting draft is a category of the student's own writing that is **not in that list.**
Ship it without adding it and every lock drawn from that draft scores `novelFraction 1.00`
and lands in `provenance_checks` as `passed=false` — **the student's own writing recorded as
coach-authored.** That is Lever B BLOCKER 1 exactly (see BACKLOG), and it would seed more
fabricated failures into the dataset Phase 2 will be calibrated from.

Not a follow-up. The same change.

## 🔴 The cheat vector, named

**Declaring a draft does not verify authorship.** A student could paste someone else's essay
as their starting draft and every subsequent lock would score clean against it.

This is not a reason to refuse the feature — that vector exists today through the composer,
unlabelled and unmeasured. But the defence is **transparency, not detection**:

- The starting draft is always visible to linked parents and teachers, with its timestamp and
  word count, marked plainly as *"what they had before working with the coach."*
- Never presented as coached work, never folded into the Final Draft silently.
- The growth number is stated as growth, never as total output.

A watcher who can see "arrived with 800 words, added 40" needs no detector.

## Open decisions

- **Does the starting draft count toward the assignment's word target?** Recommend **no** —
  otherwise a student can satisfy a requirement by pasting. `lib/requirements.js` should
  measure growth. This is a product call and it changes what the progress UI means.
- **Does the coach read it?** Recommend **yes**, and it is most of the value: the coach can
  say something true about work the student already did. But this makes it prompt input, so
  it interacts with Rule 0 (uploaded worksheets: read back, lock what is done, offer on thin)
  and needs `npm run test:prompts`.
- **Does it seed the scaffold?** Recommend **no** for v1. Segmenting a pasted draft into
  components is the hard, dangerous half (see `SPEC-lock-by-reference.md` on anchors doing
  segmentation) and it should not ride along with capture.
- **Upload path.** `parse-assignment` already handles photos/PDFs; reusing it is tempting but
  its prompt is tuned for *assignments*, not student drafts. Decide before reusing.

## Lanes

**Write the spec before splitting the work** — this is the only item on the board that spans
two lanes, and a cross-lane seam produced three of this week's bugs.

- `focus/assignment-intake` — the capture step, the table, migration 071, the RLS proof.
- `focus/coaching-session` — rendering it beside the working draft, the growth artifact, and
  the `studentSources` wiring in the scaffold route.

The `studentSources` line is the seam. It lives in coaching-session's file and is meaningless
until intake writes rows, so **it must be a single reviewed change across both, not two
independently-green lanes** (a lane's tests can be honest and the integration still broken —
see the 133-commit-stale worktree in memory).

## Verification

- Insert a starting draft, then attempt UPDATE and DELETE as the student. Both must be
  refused, asserted on a **planted sentinel row** and read back — not on a status code.
- A lock whose text comes from the starting draft scores `novelFraction` near 0, not 1.0.
  This is the regression that proves the `studentSources` wiring actually landed.
- Delete the session; the row is gone. Prove the COPPA cascade rather than assuming it.
- A second insert for the same session fails loudly.
- A parent viewing the transcript sees the starting draft, labelled, with the growth number.
- 🔴 **Adversarial review before merge.** This touches persistence of student work and the
  provenance baseline, and it is cross-lane — the two conditions that have produced every
  serious bug in this repo.
