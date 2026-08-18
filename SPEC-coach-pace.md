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

## The control — podcast-style, beside the read-aloud toggle

**A tap-to-cycle rate button, not a settings page.** Robert, 2026-08-17: *"a toggle near the
mic that can speed it up or down like someone listening to a podcast?"* — yes, with one
placement correction.

**Beside `VoiceToggleButton`, not the mic.** The mic is the student's INPUT; pace is the
coach's OUTPUT. A speed control next to the mic reads as "how fast I talk." `VoiceToggleButton`
is already the coach-voice control and already renders in BOTH composer modes
(`TutorSession.js:699` and `741`), so the two form one cluster: on/off + speed. That is the
podcast-player pattern exactly.

**Why tap-to-cycle beats a settings page**, and it is not a style preference:
- **The moment of need is mid-sentence.** You discover the pace is wrong while listening. A
  settings screen means leaving the session to fix it, which most students will not do — they
  will turn the voice off instead.
- **It is self-teaching.** A visible `1×` tells a student the control exists. A buried
  setting tells them nothing, and a student who does not know they can slow the coach down is
  identical to a student who cannot.
- **Zero learning curve.** YouTube, Spotify, TikTok, audiobooks. They already know it.

🔴 **One thing podcasts get backwards for this audience. Podcast users mostly speed UP; these
students mostly need to slow DOWN.** A cycle that runs 1× → 1.25× → 1.5× serves the wrong
direction first and buries the accessibility case behind three taps. Lead with slower:

    1× → 0.75× → 0.5× → 1.25× → 1.5× → 1×

Always visible (not only during playback) so it can be set before the coach speaks, and a
44px tap target per the WCAG floor in CLAUDE.md.

## The route already exists

`app/api/profile/voice/route.js` takes `{ readAloud: boolean }` and writes `coach_read_aloud`
to the caller's own row (migration 030). Extend it to accept `{ pace: number }` → the new
`coach_pace` column, and reuse the `savingVoicePref` state already threaded through
`ReplyComposer`. **No new route, no new plumbing** — one column, one param, one button beside
an existing button.

## Coach-pick entry point — OPTIONAL, cut from v1

An earlier draft of this spec called two entry points mandatory. That was over-specified. With
a persistent, discoverable, one-tap in-session control, a student sets their pace in the first
minute of their first session and never thinks about it again. Setting it on the picker while
sampling voices is a nice touch, not a requirement — build it if it is cheap, and do not block
v1 on it.

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

- **Range and steps:** five presets, not a continuous range —
  `1× → 0.75× → 0.5× → 1.25× → 1.5×`, default 1×, slower first (see the control section).
  ⚠️ An earlier draft of this spec said "0.1 steps with a slider beneath" while the control
  section specified tap-to-cycle. Those contradict, and a contradictory spec gets resolved by
  whoever reads it last — the same failure coach-ai hit today in a prompt that claimed both
  "flow into a single paragraph" and "preserve every interior break". **Presets win**: a
  slider needs fine motor control and a decision, a button needs one tap, and no student
  needs 1.3× specifically.
- **The label is the rate itself** (`1×`, `0.75×`), because that is what every app they
  already use shows. Put the plain words in the `aria-label` and the tooltip, not the face.
- **Per-student, not per-coach.** Pace is about the listener. It must not reset when they
  switch coaches — that would silently undo an accessibility setting mid-assignment.
- **Not price-gated.** Consistent with the standing rule that voice is not a paid tier.
- **No COPPA gate.** A playback preference on the student's own profile is ordinary
  operation; an under-13 student only has an account because a parent consented.

## Out of scope for v1

- Per-coach pace overrides.
- Auto-detecting a preferred pace from behaviour. Tempting and wrong — inferring a disability
  accommodation from usage data is a much larger decision than a button.
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
