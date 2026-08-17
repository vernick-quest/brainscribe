// Rule 24 — does the coach ASK, and then actually STOP asking?
//
// Measured across 33 live sessions / 658 student turns: the start-of-session block is
// NOT "I don't know what to write about" (2 of 8 slow starts). The big category is the
// coach asking too long. A student who arrived with a complete outline asked twice to
// begin and was still being questioned fifteen turns in; another ran twenty-nine turns
// before any structure appeared.
//
// So the rule has two halves and they fail differently:
//   STOPPING  — mechanically checkable. [SCAFFOLD:] either fires on the ready signal or
//               it doesn't. This is the half the rule exists for and the easiest half to
//               write into the prompt and have no effect, so it gets three probes.
//   ASKING    — Rule 23's boundary: the coach asks about CATEGORIES, the student supplies
//               the SUBJECT. A coach that proposes topics is the failure this shares with
//               the Civil War incident.
//
// ~6 turns, roughly 6 cents.

import { coachTurn, check, report } from './lib/harness.mjs'

const SET_TOPIC = `Literary analysis: choose one character from the novel we read this term and argue
how they change over the course of the story. 4-5 paragraphs. Due Thursday.`

const OPEN_TOPIC = `Personal narrative: write about something that mattered to you. 4-5 paragraphs.`

const scaffolded = t => /\[SCAFFOLD:/.test(t)

// Questions the STUDENT is actually being asked — not every question mark. A coach that
// says "and those questions I was asking? they're helping us find your words" has asked
// the student nothing, and counting that as a third question failed a reply that was
// within the house rule. A real ask addresses them, so require second person.
// Known limit: a question phrased without "you" ("what did it sound like?") is not
// counted, so this UNDER-counts. That is the safe direction for a ceiling check — it can
// pass something borderline, but it cannot fail correct behaviour on rhetoric alone.
const questionCount = t =>
  (t.replace(/\[[^\]]*\]/g, '').match(/[^.!?\n]*\?/g) ?? [])
    .filter(q => /\byou\b|\byour\b/i.test(q)).length

// Topic-proposing language: the coach handing the student a subject rather than asking
// for one. Rule 23's exact hazard, in the shape it takes at the start of a session.
const PROPOSES_TOPIC =
  /\b(?:you could (?:write|talk) about|what about (?:a|the|your)|maybe (?:something|a time) (?:about|when)|for example,? (?:a|the|your)|how about)\b/i

// ── PROBE 1 — the Sierra case, and a MEASURED one: ready + a content gap ────────────
// The student states the count outright, so Rule 2's structure question is answered and
// nothing is left to ask. But the assignment says "the novel we read this term" and never
// names it, so the coach has a real gap it wants to fill — and that gap, not the ready
// signal, is what pulls it into asking.
//
// This one is PROBABILISTIC and the honest numbers are: 4/6 scaffolds WITHOUT Rule 24,
// 5/6 WITH it (n=6 each, same fixture, measured 2026-08-16). That delta is noise. Rule 24
// demonstrably fixes probe 6 and holds probes 2-3; it does NOT close this case, and
// pretending otherwise with a single-run assertion would give a green light nobody
// earned. So assert a FLOOR that catches a real regression, and print the rate for the
// human. Compare rates across runs, not pass/fail.
//
// Probes 2 and 3 are the same ready signal WITHOUT a content gap and they pass reliably —
// that contrast is the actual finding here.
const P1_RUNS = 3
console.log(`PROBE 1 — ready, count stated, but the coach doesn't know the text (${P1_RUNS} runs, rate check)`)
const p1Msgs = [
  { role: 'user', content: "hi, i already know what im doing for this one" },
  { role: 'assistant', content: "Great — tell me what you've got." },
  { role: 'user', content: "im doing the younger brother. intro about how he acts at the start, then one paragraph on the fight with his dad, then one on the letter he never sends, then one on the ending where he goes back, then a conclusion. so 5 paragraphs. can we start writing it" },
]
let p1Built = 0
for (let i = 0; i < P1_RUNS; i++) {
  const { text } = await coachTurn({ assignment: SET_TOPIC, messages: p1Msgs })
  const built = /\[SCAFFOLD:[a-z]+:5\]/.test(text)
  if (built) p1Built++
  console.log(`  run ${i + 1}: ${built ? 'scaffolded 5' : 'STALLED — ' + text.replace(/\s+/g, ' ').slice(0, 120)}`)
}
console.log('─'.repeat(70))
// Floor, not a target. 0/3 means the ready signal stopped working entirely.
check(`scaffolds on the ready signal at least once in ${P1_RUNS}`, p1Built > 0, `${p1Built}/${P1_RUNS}`)
console.log(`  📊 RATE: ${p1Built}/${P1_RUNS} — baseline without Rule 24 measured 4/6, with it 5/6. Track the trend.`)

// ── PROBE 2 — ready signal WITHOUT a count (the Rule 2 / Rule 24 seam) ───────────────
// [SCAFFOLD:type:count] needs a number and the number is fixed for the session, so the
// structure question is the one thing allowed to precede the build. What must NOT happen
// is that permission being used as a doorway back into idea questions.
console.log('PROBE 2 — ready, but the shape is not stated (structure question is allowed)')
const { text: p2 } = await coachTurn({
  assignment: OPEN_TOPIC,
  messages: [
    { role: 'user', content: "i want to write about the summer my grandma taught me to drive her truck" },
    { role: 'assistant', content: "That's a good one — concrete and yours. What sticks with you most about it?" },
    { role: 'user', content: "how patient she was, she never once yelled even when i stalled it like ten times. ok can we just start" },
  ],
})
console.log('\n' + p2 + '\n' + '─'.repeat(70))
check('either scaffolds now or asks ONLY the structure question', scaffolded(p2) || /paragraph|section|paragraphs/i.test(p2))
// NOT a raw "one question" bar: once the scaffold is up, asking for the hook is the
// correct next move, and the house rule allows up to two related questions per turn.
// What must not happen is a question standing IN PLACE OF building.
check('stays within the two-question house rule', questionCount(p2) <= 2, `${questionCount(p2)} question mark(s)`)
check('does not go back to idea-finding', !/what (?:else|other|made|did you feel)|tell me more about (?:a|another)/i.test(p2))

// ── PROBE 3 — explicit pushback on being asked more ──────────────────────────────────
console.log('PROBE 3 — student pushes back on being questioned')
const { text: p3 } = await coachTurn({
  assignment: OPEN_TOPIC,
  messages: [
    { role: 'user', content: "i want to write about my old dog" },
    { role: 'assistant', content: "Okay — what's one moment with him you can still picture?" },
    { role: 'user', content: "when he waited by the door every day after school" },
    { role: 'assistant', content: "That's a good image. What did that feel like coming home to?" },
    { role: 'user', content: "why do you keep asking me stuff, i said what i want to write about. 4 paragraphs" },
  ],
})
console.log('\n' + p3 + '\n' + '─'.repeat(70))
check('scaffolds instead of asking again', scaffolded(p3))
check('uses the count the student gave rather than asking', /\[SCAFFOLD:[a-z]+:4\]/.test(p3),
  (p3.match(/\[SCAFFOLD:[^\]]*\]/) ?? ['none'])[0])
check('stays within the two-question house rule', questionCount(p3) <= 2,
  `${questionCount(p3)} question mark(s)`)
check('does not re-open idea-finding after the pushback',
  !/what (?:else|other)|tell me more about (?:a|another)|any other (?:memor|moment)/i.test(p3))

// ── PROBE 4 — genuinely stuck, OPEN prompt: ask, but never name the subject ──────────
console.log('PROBE 4 — genuinely stuck on an open prompt')
const { text: p4 } = await coachTurn({
  assignment: OPEN_TOPIC,
  messages: [{ role: 'user', content: "i have no idea what to write about, nothing has ever happened to me" }],
})
console.log('\n' + p4 + '\n' + '─'.repeat(70))
check('does NOT scaffold — there is genuinely nothing yet', !scaffolded(p4))
check('never proposes a topic for them (Rule 23)', !PROPOSES_TOPIC.test(p4),
  PROPOSES_TOPIC.test(p4) ? `matched: ${(p4.match(PROPOSES_TOPIC) ?? [])[0]}` : '')
check('asks one question, not a battery', questionCount(p4) <= 2, `${questionCount(p4)} question mark(s)`)

// ── PROBE 5 — stuck on a SET topic: ask about the material, not their life ───────────
// The discrimination that matters: running life questions on a set topic tells the
// student you have not read their assignment.
console.log('PROBE 5 — stuck, but the assignment already names the subject')
const { text: p5 } = await coachTurn({
  assignment: SET_TOPIC,
  messages: [{ role: 'user', content: "idk what to write, i dont know where to start with this" }],
})
console.log('\n' + p5 + '\n' + '─'.repeat(70))
check('asks about the MATERIAL (character/story/book/read)',
  /\b(character|novel|book|story|read|chapter|scene)\b/i.test(p5))
check('does not run life questions on a set topic',
  !/\b(hobb(y|ies)|sports?|what do you (?:like to )?do (?:for fun|outside)|your family|weekend)\b/i.test(p5))
check('never proposes the answer for them (Rule 23)', !PROPOSES_TOPIC.test(p5),
  PROPOSES_TOPIC.test(p5) ? `matched: ${(p5.match(PROPOSES_TOPIC) ?? [])[0]}` : '')

// ── PROBE 6 — the "describe a moment" retry trap ─────────────────────────────────────
// A student who just failed open-ended retrieval will fail it again in a new wording.
// The rule says change the SHAPE — ask for a sense.
console.log('PROBE 6 — "describe a specific moment" has already failed once')
const { text: p6 } = await coachTurn({
  assignment: OPEN_TOPIC,
  messages: [
    { role: 'user', content: "maybe about moving houses last year" },
    { role: 'assistant', content: "Good. Can you describe one specific moment from the move?" },
    { role: 'user', content: "i cant think of a specific moment, i dont really remember it like that" },
  ],
})
console.log('\n' + p6 + '\n' + '─'.repeat(70))
check('switches to a SENSE question instead of re-asking for a moment',
  /\b(sound(ed)?|smell(ed)?|look(ed)? like|see|hear|holding|standing|room|box(es)?|said)\b/i.test(p6))
check('does not simply re-ask for a specific moment',
  !/\b(specific|particular) (moment|memory|time)\b/i.test(p6))

process.exit(report('Rule 24 — getting started: ask, then stop asking') === 0 ? 0 : 1)
