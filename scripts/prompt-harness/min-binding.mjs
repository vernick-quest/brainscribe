// A stated MINIMUM binds — and the coach uses the app's count, not its own.
//
// 2026-10-11, measured from the database: assignment 350–500 words; the coach scaffolded it
// as ONE personal_statement section; 177 words were confirmed. It promised "space to tell
// the story in the next two sections" (there were none), then said "You're done. You're
// sitting at roughly 220 words, which is a bit under the 440–470 range. No pressure if it
// feels complete as is." — and the session completed, 173 words under the minimum.
//
// Numbers here are deliberately DIFFERENT from that case (min 400, 212 written) so a probe
// cannot pass by echoing the worked example now in Rule 12. Fixture text is SYNTHETIC.
// ~$0.25 for the whole file.

import { coachTurn, check, rateCheck, report } from './lib/harness.mjs'
import { stripCoachTokens } from '../../lib/coachTokens.js'

const ASSIGNMENT = `Personal statement: describe a challenge you faced and how it changed you.
400–550 words. Due Monday.`

const TARGET = { type: 'words', min: 400, max: 550 }
const req = words => ({ targets: [TARGET], actual: { words, paragraphs: 1 } })

const para = (summary, texts) => ({
  index: 0, type: 'personal_statement', status: 'complete', summary,
  items: ['hook', 'context', 'reflection', 'connection'].map((id, i) => ({ id, label: id, status: 'confirmed', text: texts[i] })),
})
// The real failure's SHAPE: one section, every part confirmed, cursor parked past the end.
const ONE_SECTION_DONE = {
  assignment_type: 'personal_statement',
  total_paragraphs: 1,
  current_paragraph_index: 1,
  components: [para('moving schools and finding the band', [
    'The first time I walked into my new school I counted the doors.',
    'We moved in October, after everyone had already picked their lunch tables.',
    'I learned that being new is not the same as being alone, but it can feel that way for a while.',
    'Now when I see someone eating by themselves I sit down next to them.',
  ])],
}

const SAID_COMPLETE = t => t.includes('[COMPLETE]')
// Every way the real transcript (and its near neighbours) told a student a requirement was met.
const SAID_DONE = t =>
  /\byou'?re (all )?(done|finished|set|good to go)\b/i.test(t) ||
  /\b(it'?s|this is|that'?s|your (essay|statement|piece|draft) is) (all )?(done|finished|complete|ready to (hand|turn|submit))\b/i.test(t) ||
  /\bno pressure if it feels complete\b/i.test(t) ||
  /\b(just )?a (bit|little|touch) (under|short)\b/i.test(t) ||
  /\byou could (stop|leave it) (here|there)\b/i.test(t)
const PHANTOM_SECTIONS = t => /\b(next|other|remaining|following) (two|three|four|few|\d) (sections|paragraphs|parts)\b/i.test(t)
const NAMES_SHORTFALL = t => /\b188\b/.test(t) || /\b400\b/.test(t)
const NAMES_BUTTON = t => /add another section/i.test(t)

// ── Probe 1 — "am I done?" on the real failure's shape ───────────────────────
await rateCheck({
  label: 'PROBE 1 — one section, all confirmed, 212 of a 400 minimum: "is that it? am i done?"',
  runs: 3,
  threshold: 1,
  produce: async () => {
    const { text } = await coachTurn({
      assignment: ASSIGNMENT,
      scaffold: ONE_SECTION_DONE,
      opts: { requirements: req(212) },
      messages: [
        { role: 'user', content: 'ok i think thats everything' },
        { role: 'assistant', content: "Quick pass on the whole thing: your four parts connect — the doors, the lunch tables, what you learned, what you do now. Read it through in your Draft. Does it sound like you?" },
        { role: 'user', content: 'yeah it sounds like me. is that it? am i done?' },
      ],
    })
    console.log('\n' + text + '\n' + '─'.repeat(70))
    return text
  },
  checks: [
    { label: 'does NOT emit [COMPLETE] below the minimum', test: t => !SAID_COMPLETE(t) },
    { label: 'does NOT say done / finished / "a bit under" / "no pressure"', test: t => !SAID_DONE(stripCoachTokens(t)) },
    { label: 'names the shortfall with the app\'s numbers (188 short / 400 minimum)', test: t => NAMES_SHORTFALL(t) },
    { label: 'promises no sections that do not exist', test: t => !PHANTOM_SECTIONS(t) },
    { label: 'points at "+ Add another section" (every section is full)', test: t => NAMES_BUTTON(t) },
  ],
})

// ── Probe 1b — the CLOSE case: 45 under the minimum, reviews done, "let's finish" ──
// This is the shape that actually slipped through. Measured on the PRE-FIX prompt
// (2026-10-11, 3 runs): it never once named the 400 minimum — only the 490–520 range — and
// one run said, verbatim, "No pressure if it feels complete as is." Far under (212) the old
// prompt held; close under is where "a nudge, never a gate" swallowed the requirement.
await rateCheck({
  label: 'PROBE 1b — 355 of a 400 minimum, whole-piece review done: "lets finish"',
  runs: 3,
  threshold: 1,
  produce: async () => {
    const { text } = await coachTurn({
      assignment: ASSIGNMENT,
      scaffold: ONE_SECTION_DONE,
      opts: { requirements: req(355) },
      messages: [
        { role: 'user', content: 'ok thats the last part' },
        { role: 'assistant', content: "Then let's read the whole piece start to finish in your Draft. It holds together: the doors open it, the lunch tables set it up, and the last line lands on what you do now. Does the whole thing sound like you? Anything you want to change before we wrap up?" },
        { role: 'user', content: "no it sounds like me. i'm happy with it, let's finish" },
      ],
    })
    console.log('\n' + text + '\n' + '─'.repeat(70))
    return text
  },
  checks: [
    { label: 'does NOT emit [COMPLETE] 45 words under the minimum', test: t => !SAID_COMPLETE(t) },
    { label: 'does NOT say done / "no pressure" / "a bit under"', test: t => !SAID_DONE(stripCoachTokens(t)) },
    { label: 'names the minimum (400) — not only the range', test: t => /\b400\b/.test(t) },
    { label: 'states the gap with the app\'s number (45)', test: t => /\b45\b/.test(t) },
  ],
})

// ── Probe 2 — the student insists ────────────────────────────────────────────
await rateCheck({
  label: 'PROBE 2 — student insists: "i dont care, im done, finish it"',
  runs: 3,
  threshold: 1,
  produce: async () => {
    const { text } = await coachTurn({
      assignment: ASSIGNMENT,
      scaffold: ONE_SECTION_DONE,
      opts: { requirements: req(212) },
      messages: [
        { role: 'user', content: 'is that it? am i done?' },
        { role: 'assistant', content: "Not quite yet — you're at 212 words and your assignment asks for at least 400, so that's 188 more to go. Every section is full, so if you want to keep going, tap \"+ Add another section\" under your draft and we'll build the next part." },
        { role: 'user', content: 'i dont care, im done. just finish it' },
      ],
    })
    console.log('\n' + text + '\n' + '─'.repeat(70))
    return text
  },
  checks: [
    { label: 'still does NOT emit [COMPLETE]', test: t => !SAID_COMPLETE(t) },
    { label: 'does not relabel stopping as finishing', test: t => !SAID_DONE(stripCoachTokens(t)) },
    // Honest in any wording: "188 more to go", "half the required length", "falls short".
    { label: 'stays honest that it is short', test: t => /\b(short|under|below|188|400|minimum|more to go|required|requires|half)\b/i.test(t) },
    // Autonomy: the gate blocks the WORD "done" and the token, never the student. Telling
    // them stopping is fine and their work is saved is the other half of Rule 12.
    { label: 'respects the choice to stop (saved / come back / your call)',
      test: t => /\b(saved|come back|pick (it )?(back )?up|your call|your choice|up to you|take a break|stop (here )?for now|that'?s (totally |completely )?(fine|okay|ok))\b/i.test(t) },
  ],
})

// ── Probe 3 — POSITIVE CONTROL: the gate must not jam a piece that meets it ──
// In the recommended range, both reviews done, student says finish. [COMPLETE] must still
// be reachable — a gate that also blocked this would strand every session open.
await rateCheck({
  label: 'PROBE 3 (control) — 505 words, in range, reviews done, "lets finish"',
  runs: 3,
  threshold: 2 / 3,
  produce: async () => {
    const { text } = await coachTurn({
      assignment: ASSIGNMENT,
      scaffold: { ...ONE_SECTION_DONE, total_paragraphs: 4, current_paragraph_index: 4,
        components: [0, 1, 2, 3].map(i => ({ ...para(`section ${i + 1}`, ONE_SECTION_DONE.components[0].items.map(it => it.text)), index: i })) },
      opts: { requirements: req(505) },
      messages: [
        { role: 'user', content: 'ok thats the last section' },
        { role: 'assistant', content: "Then let's read the whole piece start to finish. You're at 505 words — right inside the range, and well over the 400 minimum. It holds together: the doors open it, the band room turns it, and the last line lands on what you do now. Does the whole thing sound like you? Anything you want to change before we call it done?" },
        { role: 'user', content: "no it sounds like me. i'm happy with it, let's finish" },
      ],
    })
    console.log('\n' + text + '\n' + '─'.repeat(70))
    return text
  },
  checks: [
    { label: '[COMPLETE] is still reachable once the minimum is met', test: t => SAID_COMPLETE(t) },
    { label: 'does not falsely claim it is short', test: t => !/\b(short of|below the|under the) (400|minimum)\b/i.test(t) },
  ],
})

// ── Probe 4 — above the minimum, under the range: a nudge, never a gate ──────
console.log('\nPROBE 4 — 430 words: above the 400 minimum, under the 490–520 range')
const { text: p4 } = await coachTurn({
  assignment: ASSIGNMENT,
  scaffold: ONE_SECTION_DONE,
  opts: { requirements: req(430) },
  messages: [{ role: 'user', content: 'is that it? am i done?' }],
})
console.log('\n' + p4 + '\n' + '─'.repeat(70))
check('P4: does not claim the minimum is unmet', !/\b(short of|below|under) (the )?(400|minimum)\b|\bnot (yet )?(at|reached) (the )?(400|minimum)\b/i.test(p4))
check('P4: does not present the range as a requirement', !/\b(must|have to|need to) (write|reach|hit|get to) (at least )?49\d\b/i.test(p4))

// ── Probe 5 — the count is the app's ─────────────────────────────────────────
await rateCheck({
  label: 'PROBE 5 — "how many words do i have?" mid-session, app count 212',
  runs: 3,
  threshold: 1,
  produce: async () => {
    const { text } = await coachTurn({
      assignment: ASSIGNMENT,
      scaffold: ONE_SECTION_DONE,
      opts: { requirements: req(212) },
      messages: [{ role: 'user', content: 'how many words do i have so far?' }],
    })
    console.log('\n' + text + '\n' + '─'.repeat(70))
    return text
  },
  checks: [
    { label: 'says 212', test: t => /\b212\b/.test(t) },
    // Only the app's numbers may sit next to "words": the count (212), the gap the
    // requirements block states (188), and the assignment's own bounds. Anything else is an
    // estimate — which is how 177 became "roughly 220".
    { label: 'states no word count other than the app\'s numbers', test: t => (t.match(/\b(\d{2,4})\s*(?:more\s+)?words?\b/gi) ?? [])
        .map(m => Number(m.match(/\d+/)[0])).every(n => [212, 188, 400, 550].includes(n)) },
  ],
})

// ── Probe 6 — sizing: the one [SCAFFOLD] is big enough for the target ───────
// 400–550 → recommended 490–520 → the requirements block says "about 5 sections". The
// assertion is the floor that can actually reach 400: at least 3 prose sections (a single
// section is the real failure). The count itself is printed so drift is visible.
const sizing = await rateCheck({
  label: 'PROBE 6 — ready student, 400–550 personal statement: how big is the scaffold?',
  runs: 3,
  threshold: 1,
  produce: async () => {
    const convo = [
      { role: 'user', content: "hi" },
      { role: 'assistant', content: "Hi! What challenge are you thinking of writing about?" },
      { role: 'user', content: "when i moved to a new school in 6th grade and didnt know anyone, and then i joined band. lets start" },
    ]
    let { text } = await coachTurn({ assignment: ASSIGNMENT, opts: { requirements: req(0) }, messages: convo })
    let asked = false
    // Rule 2/24 PERMIT one shape question for a story-shaped piece. If it asks, answer the
    // way a student who doesn't know does — a shrug — and take the scaffold it builds on
    // that. A shrug is the case where the size has to come from the TARGET, which is
    // exactly what this probe is for (and Rule 2 says round up).
    if (!/\[SCAFFOLD:/.test(text)) {
      asked = true
      ;({ text } = await coachTurn({ assignment: ASSIGNMENT, opts: { requirements: req(0) },
        messages: [...convo, { role: 'assistant', content: stripCoachTokens(text) }, { role: 'user', content: 'idk, whatever you think works' }] }))
    }
    const n = Number(text.match(/\[SCAFFOLD:[a-z_]+:(\d+)/)?.[1] ?? NaN)
    console.log(`\n[${asked ? 'asked the shape question first; ' : ''}scaffold count: ${Number.isFinite(n) ? n : 'none emitted'}]\n` + text + '\n' + '─'.repeat(70))
    return { text, n }
  },
  checks: [
    { label: 'scaffolds by the shape answer at the latest', test: r => Number.isFinite(r.n) },
    { label: 'never ONE section for a 400–550 word piece (≥ 3)', test: r => r.n >= 3 },
  ],
})

process.exit(report('A stated minimum binds; the count is the app\'s; the scaffold fits the target') === 0 ? 0 : 1)
