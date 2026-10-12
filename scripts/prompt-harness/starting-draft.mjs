// The STARTING DRAFT reaches the coach — does the coach actually USE it?
//
// 2026-10-11: a student declared a 361-word starting draft at intake. The coach never saw
// it (nothing in lib/prompts.js or /api/tutor read session_starting_drafts), so he pasted
// all 361 words into the chat by hand, and the coach built a 177-word piece around a draft
// it didn't know existed. The unit tests prove the text is IN the dynamic tail; only
// running the prompt proves the model reads it instead of asking for it again.
//
// Four probes, ~$0.10. Fixture is SYNTHETIC (public repo).

import { coachTurn, check, rateCheck, report } from './lib/harness.mjs'
import { stripCoachTokens } from '../../lib/coachTokens.js'

const ASSIGNMENT = `Personal statement: describe a challenge you faced and how it changed you.
400–550 words. Due Monday.`

const REQUIREMENTS = { targets: [{ type: 'words', min: 400, max: 550 }], actual: { words: 0, paragraphs: 0 } }

const DRAFT = `The first time I walked into Harbor Middle School I counted the doors. There were eleven of them between the front office and my locker, and every one of them had a group of kids leaning against it who already knew each other.

My family moved in October because my dad got a job at the port. Everyone else had picked their lunch tables in August. For the first three weeks I ate in the library and pretended I was reading.

Then a girl named Priya dropped her clarinet case in the hallway and the latches popped open. I helped her pick up the reeds before the bell. She asked if I played anything and I said trumpet, which was only half true because I hadn't touched it since we moved.

That afternoon I dug the trumpet out of a box in the garage. It took me two weeks to sound okay again. When I finally walked into the band room, Priya waved me over like she had been saving me a seat.

I still count doors sometimes. But now I know which ones I can walk through.`

const WORDS = DRAFT.trim().split(/\s+/).length
const PRESENT = { state: 'present', content: DRAFT, wordCount: WORDS, source: 'pasted' }

// Negated mentions ("no need to paste it", "you don't have to send it") are the RIGHT answer,
// so they are removed before looking for a request — the request itself is never excused.
const NEGATED = /\b(no need to|don't need to|do not need to|you don't have to|no need for you to|without (having to )?)\s+(re-?)?(paste|share|send|upload|type|copy)\b[^.?!\n]*/gi
const ASKS_FOR_IT = t => askRe(t.replace(NEGATED, ''))
const askRe = t =>
  /\b(paste|share|send|upload|type out|copy|drop|show me)\b[^.?!\n]{0,50}\b(it|draft|what you('ve| have)? (written|wrote|got)|your (writing|essay|statement)|here|below)\b/i.test(t) ||
  /\bhave you (written|started|got) (anything|any)\b/i.test(t)
const NAMES_THE_DRAFT = t =>
  /\b(draft|already (written|wrote|got)|you('ve| have) (already )?(written|got|started))\b/i.test(t) ||
  /\b(doors|clarinet|trumpet|Priya|band room|library)\b/i.test(t)
// A length stated as their PROGRESS ("you're at 188") — not one attributed to the draft
// ("you've got 188 words of a draft", which is true and is what the block asks for).
const CLAIMS_LENGTH_COVERED = t =>
  new RegExp(`\\b(already at|already have|you're at|you've got) (about |around |roughly )?${WORDS}\\b(?!\\s*(?:words?\\s*)?(?:of|in) (?:a|your|the) (?:starting )?draft)`, 'i').test(t) ||
  /\b(already|easily) (meet|met|over|past|hit)\b[^.?!]{0,30}\b(minimum|400|word count)\b/i.test(t)

console.log(`\nSynthetic starting draft: ${WORDS} words\n`)

// ── Probe 1 — the opening turn ───────────────────────────────────────────────
// The weakest input: a bare "hi". The app's greeting (stripped before the API call, as in
// the route) asked "have you written anything?" — the coach must not echo that question.
await rateCheck({
  label: 'PROBE 1 — opening turn on "hi", draft present',
  runs: 3,
  threshold: 1,
  produce: async () => {
    const { text } = await coachTurn({
      assignment: ASSIGNMENT,
      opts: { requirements: REQUIREMENTS, startingDraft: PRESENT },
      messages: [{ role: 'user', content: 'hi' }],
    })
    console.log('\n' + text + '\n' + '─'.repeat(70))
    return text
  },
  checks: [
    { label: 'never asks them to paste / share what they wrote', test: t => !ASKS_FOR_IT(stripCoachTokens(t)) },
    { label: 'opens on the draft (names it or something in it)', test: t => NAMES_THE_DRAFT(stripCoachTokens(t)) },
    { label: 'never treats the draft as words already in the Draft / length covered', test: t => !CLAIMS_LENGTH_COVERED(t) },
    { label: 'no [COMPLETE]', test: t => !t.includes('[COMPLETE]') },
  ],
})

// ── Positive control for Probe 1 ─────────────────────────────────────────────
// The same turn WITHOUT the block. The coach cannot know about the doors or Priya, so the
// content check must FAIL here — otherwise "opens on the draft" proves nothing. This is the
// pre-fix behaviour, and it is the reason the student had to paste 361 words by hand.
console.log('\nCONTROL — same opening turn, starting draft NOT passed (pre-fix behaviour)')
const { text: ctrl } = await coachTurn({
  assignment: ASSIGNMENT,
  opts: { requirements: REQUIREMENTS },
  messages: [{ role: 'user', content: 'hi' }],
})
console.log('\n' + ctrl + '\n' + '─'.repeat(70))
check('CONTROL: without the block the coach cannot name draft content (the check discriminates)',
  !/\b(doors|clarinet|trumpet|Priya|band room)\b/i.test(ctrl))

// ── Probe 2 — the student answers the greeting's question by pasting it ──────
console.log('\nPROBE 2 — student answers "have you written anything?" with "yes its in my draft"')
const { text: p2 } = await coachTurn({
  assignment: ASSIGNMENT,
  opts: { requirements: REQUIREMENTS, startingDraft: PRESENT },
  messages: [{ role: 'user', content: "yes i already wrote most of it, its in the draft i saved. do i need to paste it?" }],
})
console.log('\n' + p2 + '\n' + '─'.repeat(70))
check('P2: does not ask them to paste it', !ASKS_FOR_IT(stripCoachTokens(p2)))
// A LENGTH CLAIM about the draft ("what you have is 188 words") must be the app's number.
// Other numbers — the target, "212 more to go" — are not draft-length claims.
const LENGTH_CLAIM = /\b(draft|it|what you have|what you've got|you've got|you have|piece|this)\s+(is|has|'s|sits at|comes to|comes in at|is at)\s+(about |around |roughly |nearly |almost )?(\d{2,4})\s+words\b/gi
const p2Claims = [...p2.matchAll(LENGTH_CLAIM)].map(m => Number(m[4]))
check(`P2: any stated draft length is the app's ${WORDS}`, p2Claims.every(n => n === WORDS),
  p2Claims.length ? `claimed ${p2Claims.join(', ')}` : 'no length claim')
check('P2: tells them it already has it', /\b(no need|don't need|already (have|got|read|see)|i('ve| have) (got|read)|i can see)\b/i.test(p2))

// ── Probe 3 — UNKNOWN read state: never claim there is no draft ──────────────
console.log('\nPROBE 3 — read state UNKNOWN; student says they saved a draft')
const { text: p3 } = await coachTurn({
  assignment: ASSIGNMENT,
  opts: { requirements: REQUIREMENTS, startingDraft: { state: 'unknown' } },
  messages: [{ role: 'user', content: 'i put my draft in when i started the assignment, can you see it?' }],
})
console.log('\n' + p3 + '\n' + '─'.repeat(70))
check('P3: never claims they have no draft',
  !/\b(you )?(haven't|have not|didn't|did not) (written|saved|submitted|put|added|uploaded)\b|\bthere('s| is) no (draft|essay|writing)\b|\bno draft (was|has been)\b/i.test(p3))
check('P3: is honest that it cannot see it right now', /\b(can't|cannot|can not|don't|not) (see|showing|seeing|find|pull)|isn't showing|not showing/i.test(p3))

// ── Probe 4 — a KEEP lock from the draft is verbatim ──────────────────────────
// Structure already built around the draft. The student says keep the opening as is.
// The assertion is fidelity-only: IF the coach locks draft words, they must be the
// student's exact words. (Whether it locks THIS turn is a Rule 17 timing call.)
console.log('\nPROBE 4 — "keep my opening exactly like that"')
const SCAFFOLD = {
  assignment_type: 'personal_statement',
  total_paragraphs: 5,
  current_paragraph_index: 0,
  components: Array.from({ length: 5 }, (_, i) => ({
    index: i, type: 'personal_statement', status: i === 0 ? 'working' : 'locked', summary: null,
    items: ['hook', 'context', 'reflection', 'connection'].map((id, j) => ({
      id, label: id, status: i === 0 && j === 0 ? 'working' : 'locked', text: null, nuggetText: null,
    })),
  })),
}
const P4_TURN = {
  assignment: ASSIGNMENT,
  scaffold: SCAFFOLD,
  opts: { requirements: REQUIREMENTS, startingDraft: PRESENT },
  messages: [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: "You've already got a real story here — the eleven doors, Priya's clarinet, the trumpet in the garage. I've set it up as five sections, one for each paragraph you wrote. Let's start with your opening: you count the doors between the office and your locker. Want to keep that as it is, or work on it?" },
    { role: 'user', content: 'keep the first two sentences exactly like that, i like them' },
    // The review pass (Rule 17) has run, so a lock is now earned — this is the turn that
    // tests WHAT gets locked, not whether the coach is willing to.
    { role: 'assistant', content: "Quick pass before we lock it: the counting detail does a lot of work, and the second sentence is long but it reads like one breath on purpose. I'd leave both. Want me to lock those two sentences in as your hook, exactly as you wrote them?" },
    { role: 'user', content: 'yes lock it in' },
  ],
}
const norm = s => s.replace(/\s+/g, ' ').trim()
const donePayloads = t => [...t.matchAll(/\[DONE:[a-z_0-9]+:([^\]]+)\]/g)].map(m => m[1])
await rateCheck({
  label: 'PROBE 4 — "yes lock it in" on two sentences of the draft',
  runs: 3,
  threshold: 2 / 3,
  produce: async () => {
    const { text } = await coachTurn(P4_TURN)
    console.log('\n' + text + '\n' + '─'.repeat(70))
    return text
  },
  checks: [
    { label: 'a lock actually fired (not vacuous)', test: t => donePayloads(t).length >= 1 },
    { label: 'every locked payload is VERBATIM from the draft',
      test: t => donePayloads(t).every(pl => norm(DRAFT).includes(norm(pl))) },
    { label: 'does not ask them to paste or re-type it', test: t => !ASKS_FOR_IT(stripCoachTokens(t)) },
    { label: 'never re-emits [SCAFFOLD] over an existing structure', test: t => !/\[SCAFFOLD:/.test(t) },
  ],
})

process.exit(report('Starting draft — the coach reads it') === 0 ? 0 : 1)
