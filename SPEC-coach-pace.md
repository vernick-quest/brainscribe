# Spec — Coach speaking pace

**Status:** proposed, not started · **Author:** conductor, 2026-08-17 SF · **Owner:** `focus/assignment-intake`

Let a student choose how fast their coach talks, and change it without stopping the coach.

---

## Why this is accessibility, not a preference

Sierra, 2026-08-17:

> *"It's nice to have the coaches actually talk. Something about getting compliments and
> feedback from an actual person's voice is nice, **but only if they can match the pace you
> need.** I think that it'd be a nice tool if you could make it so the coaches can talk
> slower or faster per your need."*

She filed it as minor. It is not, and it lands on both stated leads at once: **voice is the
differentiator, and ADHD students are the audience.** A student who cannot follow the pace
does not get a slower coach — they turn the voice off, and then the product is a text chatbot
for exactly the students it was built for.

Promoted from P2 to **P1** on that reasoning.

---

## 🔴 Do NOT do the obvious thing

The obvious implementation is to add `speed` to the ElevenLabs request. `app/api/speak/route.js:41`:

```js
voice_settings: {
  stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true,
}
```

**Use `HTMLMediaElement.playbackRate` on the client instead.** The comparison is not close:

| | ElevenLabs `speed` | Client `playbackRate` |
|---|---|---|
| Cost to change | A **new TTS call**, billed per character again | Free |
| Latency | Full re-synthesis | Instant |
| Mid-utterance change | Impossible — must restart the line | Works while playing |
| Range | ~0.7–1.2 | 0.5–2.0 usable |
| Dependency | Model support ⚠️ **UNVERIFIED for `eleven_turbo_v2_5`** — confirm before relying on it | None |

A student discovering the coach is too fast should be able to fix it **during the sentence
that is too fast**, not by re-triggering it and paying for the audio twice. `lib/usage.js`
bills per character; a pace slider that re-synthesises would make experimenting expensive.

Leave `voice_settings` alone entirely. `stability`, `style` and `similarity_boost` shape the
voice's *character* — changing them to chase pace would alter who the coach sounds like.

## Where it lives

**`profiles.coach_pace numeric not null default 1.0`**, with a check constraint of
`0.5 <= coach_pace <= 2.0`. On the profile, not in `localStorage`: an accessibility setting a
student needs must follow them to a school Chromebook, and must not be silently lost when a
browser clears storage.

⚠️ **Migration number: re-derive at merge.** Head is 070 today, but `SPEC-starting-draft.md`
also names 071. Run `select max(version) from public.schema_migrations` when the change
lands — on 2026-08-17 a migration authored as 069 had to be renumbered to 070 for exactly
this reason.

## Where it is set — two entry points, and both are required

1. **At coach pick.** `focus/assignment-intake` already built the coach picker with voice
   previews, so the natural place to choose a pace is where the student is *already listening
   to samples*. Adjusting the slider should re-play the preview at the new rate — instantly,
   because `playbackRate` costs nothing.
2. **In session.** You do not know your pace until you are working. Must be reachable
   **without stopping the coach**, sitting beside the existing read-aloud toggle.

One is not enough: picking blind is guessing, and in-session-only means every student meets
the wrong pace first.

## 🔴 Voice-pipeline hazards — this is the most fragile area in the repo

`lib/useCoachVoice.js` plays through **one gesture-unlocked `<audio>` element** shared across
the session. Three specific traps:

- **`playbackRate` does not reliably survive a source change.** Setting it once at mount and
  assuming it sticks is the bug this will ship with. **Re-apply on every `play()`**, and add a
  test asserting the rate is still correct after the source changes.
- **Set `preservesPitch` explicitly** (and `webkitPreservesPitch` for Safari). Without it a
  slowed coach sounds drunk and a sped-up one sounds like a chipmunk — which reads as "the
  voice is broken", not "the voice is slower".
- **Do not add a pause/reload to apply the setting.** CLAUDE.md records that pausing on every
  gesture previously cut the coach off when a student merely scrolled. Changing pace must
  mutate the live element, never restart playback.

## Scope decisions

- **Range and steps:** 0.5×–2.0×, in 0.1 steps, default 1.0. Label in plain words, not
  numbers — *"slower / normal / faster"* with a slider beneath. A student who needs this
  should not have to reason about multipliers.
- **Per-student, not per-coach.** Pace is about the listener. It must not reset when they
  switch coaches — that would silently undo an accessibility setting mid-assignment.
- **Not price-gated.** Consistent with the standing rule that voice is not a paid tier.
- **No COPPA gate.** A playback preference on the student's own profile is ordinary
  operation; an under-13 student only has an account because a parent consented.

## Out of scope for v1

- Per-coach pace overrides.
- Auto-detecting a preferred pace from behaviour. Tempting and wrong — inferring a disability
  accommodation from usage data is a much larger decision than a slider.
- Changing the scribe/STT side. This is output pace only.

## Verification

- Rate persists across a coach's next utterance, and across a page reload.
- Rate changes **mid-sentence** without restarting the line.
- Pitch is unchanged at 0.5× and 2.0× (listen; this one is not automatable and belongs in
  `TESTING.md`).
- Switching coaches preserves the setting.
- ⚠️ **A student with the voice OFF is unaffected** — no new audio element, no autoplay
  attempt. The read-aloud toggle stays authoritative.
- Live check on the profile write: plant a value, read it back, and confirm a *different*
  student cannot write it. A `204` on a zero-row update reports success.
