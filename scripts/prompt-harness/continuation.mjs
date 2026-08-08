// "Keep working on this" (v2) — does the CONTINUATION block actually fire?
//
// The failure this exists to catch: a v2 session opens with EVERY component confirmed
// and EVERY paragraph ✓ done, because v1's finished scaffold is copied forward whole.
// To the coach that is indistinguishable from a session it just finished coaching, and
// Rule 12 says to celebrate and emit [COMPLETE] — closing the session the student
// opened seconds ago. A build and a unit test can only prove the rule is IN the prompt;
// only running it proves the model ACTS on it.
//
// Three probes, ~$0.05 total:
//   1. arrival turn, student names what they want         → must not close the session
//   2. arrival turn, bare "hi" (the weakest input)        → same, and must not re-scaffold
//   3. later turn, real work added + review pass done     → [COMPLETE] must still be reachable
// Probe 3 is the one that keeps this from being a one-way ratchet: a rule that made
// [COMPLETE] unreachable would strand every continuation session as permanently open.

import { coachTurn, check, report } from './lib/harness.mjs'

const ASSIGNMENT = `Persuasive essay: should recess be longer at your school?
300–400 words. Due Friday.`

const REQUIREMENTS = {
  targets: [{ type: 'words', min: 300, max: 400 }],
  actual: { words: 214, paragraphs: 3 },   // under target — why they came back
}

const para = (type, ids, summary) => ({
  type,
  status: 'complete',
  summary,
  items: ids.map(id => ({ id, status: 'confirmed', text: `confirmed ${id}` })),
})

// The real v2 opening state: v1's scaffold verbatim, cursor still parked at
// components.length (lib/sessionContinuation.js copies current_paragraph_index as-is).
const CARRIED_SCAFFOLD = {
  assignment_type: 'essay',
  total_paragraphs: 3,
  current_paragraph_index: 3,
  thesis: 'Recess should be longer because students focus better after moving.',
  components: [
    para('intro', ['hook', 'context', 'thesis'], 'opens on the 10:15 bell and states the claim'),
    para('body', ['topic_sentence', 'evidence', 'analysis'], 'kids come back from recess able to concentrate'),
    para('conclusion', ['restate', 'closing'], 'asks the principal to try a longer break'),
  ],
}

const OPTS = { requirements: REQUIREMENTS, continuation: true }

const saidComplete = t => t.includes('[COMPLETE]')
const saidScaffold = t => /\[SCAFFOLD:/.test(t)
// The congratulation the student must NOT get: they are here because it ISN'T done.
const saidFinished = t =>
  /\b(your|the) (essay|assignment|draft|piece) is (all )?(done|finished|complete)\b/i.test(t) ||
  /\byou'?(ve| have) finished (your|the) (essay|assignment)\b/i.test(t) ||
  /\bnothing (left|more) to (do|write)\b/i.test(t)

// ── Probe 1 — arrival, the student says what they want ───────────────────────
console.log('PROBE 1 — v2 arrival: "I want to make it longer"')
const { text: p1 } = await coachTurn({
  assignment: ASSIGNMENT,
  scaffold: CARRIED_SCAFFOLD,
  opts: OPTS,
  messages: [{ role: 'user', content: "i'm back, my teacher said it was too short. i want to make it longer" }],
})
console.log('\n' + p1 + '\n' + '─'.repeat(70))

check('does not emit [COMPLETE] on arrival', !saidComplete(p1))
check('does not tell them the essay is finished', !saidFinished(p1))
check('does not re-emit [SCAFFOLD] over the carried work', !saidScaffold(p1))
// It should ground itself in the carried draft rather than acting like a blank page.
check('references their actual carried work (thesis/recess/paragraph)',
  /recess|thesis|paragraph|body|conclusion|intro/i.test(p1))
// Rule 14: it may cite the given numbers and may state the gap derived from them
// ("about 150 words to find" from 214 → 360–380 is arithmetic on real figures, not a
// claim about the assignment). What it may NOT do is present a DIFFERENT target as
// the goal. Assert on that, not on the presence of any number.
const invented = (p1.match(/(?:aim for|target of|shoot for|get to|reach)\s+(?:about |around |roughly )?(\d{3})/gi) ?? [])
  .map(m => m.match(/(\d{3})/)[1])
  .filter(n => !['300', '400', '360', '380'].includes(n))
check('states no target other than the ones it was given', invented.length === 0,
  invented.length ? `claimed target(s): ${invented.join(', ')}` : '')

// ── Probe 2 — arrival, bare "hi" (the weakest possible input) ────────────────
// With nothing to work from, the persona's all-done branch is at its most tempting.
console.log('\nPROBE 2 — v2 arrival: bare "hi"')
const { text: p2 } = await coachTurn({
  assignment: ASSIGNMENT,
  scaffold: CARRIED_SCAFFOLD,
  opts: OPTS,
  messages: [{ role: 'user', content: 'hi' }],
})
console.log('\n' + p2 + '\n' + '─'.repeat(70))

check('does not emit [COMPLETE] on a bare hi', !saidComplete(p2))
check('does not tell them the essay is finished', !saidFinished(p2))
check('does not re-emit [SCAFFOLD] over the carried work', !saidScaffold(p2))
check('asks what they want to strengthen or add', /\?/.test(p2))

// ── Probe 3 — the ratchet check: can it still finish? ────────────────────────
// The student has added a real paragraph THIS session, the per-component review pass
// (Rule 17) AND the whole-piece review (Rule 16) have both already run, and they've
// said they're done. [COMPLETE] is now the correct move. Run the IDENTICAL
// conversation with the flag off as a control: if completion fires without the block
// and not with it, the block is the thing jamming it shut — not the review gates.
console.log('\nPROBE 3 — later in the v2: work added, both reviews done, student says finish it')
// The scaffold is UNCHANGED — that is the real post-addition state, and it is what
// makes this a hard test. The paragraph count is fixed in v1 of this feature, so a
// dictated addition lands as a new `paragraphs` row and never grows the scaffold: the
// coach is still staring at "all 3 paragraphs ✓ done, nothing queued" at the exact
// moment it has to decide whether completing is now allowed. Only the word/paragraph
// counts in ASSIGNMENT REQUIREMENTS move. (An earlier version of this probe faked a
// 4-section scaffold — a state the app cannot actually produce, which would have
// tested a shape that never ships.)
const ADDED_SCAFFOLD = CARRIED_SCAFFOLD
const FINISHING_TURN = {
  assignment: ASSIGNMENT,
  scaffold: ADDED_SCAFFOLD,
  messages: [
    { role: 'user', content: "i'm back, my teacher said it was too short" },
    { role: 'assistant', content: "Your whole draft carried over — the recess thesis, your body paragraph about focusing, and the conclusion. What do you want to build on?" },
    { role: 'user', content: 'i want to add the thing about the nurse seeing fewer headaches' },
    { role: 'assistant', content: "Good — say it out loud, the whole thought." },
    { role: 'user', content: 'Our school nurse told my class she sees fewer headache visits on the days we get the long recess. That shows moving around does something real for how we feel, not just how we act.' },
    { role: 'assistant', content: "That's locked in. On that paragraph: you start two sentences in a row with \"Our school\" — worth varying one. And \"real\" is doing a lot of work in that last line; you used \"focus\" earlier, which is sharper. Want to change either, or leave them?" },
    { role: 'user', content: "i'll leave them, i like it" },
    // The count below is stated as ALREADY INCLUDING the addition on purpose. Left
    // ambiguous, the coach adds the new paragraph's words on top of the given figure
    // ("372 plus about 40, so ~410 — over the limit") and asks for a trim instead of
    // finishing. Measured at n=5 per arm, that drift happens at the SAME rate with the
    // continuation block on (4/5 completed) and off (4/5) — so it is a word-count
    // behaviour, not this rule, and staging it out keeps the probe measuring the one
    // variable it is here for.
    { role: 'assistant', content: "Then let's read the whole piece start to finish. With the nurse paragraph in, you're at 372 words — right inside the range. It holds together: the 10:15 bell opens it, the focus paragraph and the nurse paragraph both back the claim, and the conclusion asks the principal for something specific. The one thing I'd point at across the whole draft is that three paragraphs open with a time or a place — it gives it a slight list feel. Does the whole thing sound like you? Anything you want to change before we call it done?" },
    { role: 'user', content: "no it sounds like me. i'm happy with it, let's finish" },
  ],
}
// Land INSIDE the recommended 360–380 band. At 352 the coach correctly asks for one
// more sentence (Rule 14a) and never reaches [COMPLETE] — with the block on OR off —
// which would make this probe measure the word-count rule instead of the continuation
// rule. The control caught exactly that; keep the two variables separated.
const withReq = { requirements: { ...REQUIREMENTS, actual: { words: 372, paragraphs: 4 } } }

const [{ text: p3 }, { text: p3control }] = await Promise.all([
  coachTurn({ ...FINISHING_TURN, opts: { ...withReq, continuation: true } }),
  coachTurn({ ...FINISHING_TURN, opts: withReq }),   // control: same turn, block OFF
])
console.log('\n[continuation ON]\n' + p3 + '\n' + '─'.repeat(70))
console.log('\n[control, block OFF]\n' + p3control + '\n' + '─'.repeat(70))

// The control is DIAGNOSTIC, not a check. Whether to close now or ask "anything else?"
// is a real judgement call at this boundary and the control lands on both sides across
// runs — asserting on it would make the gate flaky about something that isn't the rule
// under test. It earns its cost by telling us WHY a failure happened.
const onCompleted = saidComplete(p3)
const controlCompleted = saidComplete(p3control)
check('[COMPLETE] is still reachable once they have actually done more', onCompleted,
  onCompleted ? ''
    : controlCompleted
      ? '🔴 the control DID complete on the identical turn — the continuation block is what jammed it shut'
      : 'the control did not complete either, so a review/word-count gate is holding this turn rather than the continuation block — restage before blaming the block')
console.log(`  ℹ  control (block off) ${controlCompleted ? 'completed' : 'did not complete'} — diagnostic only, never a pass/fail`)
check('does not re-emit [SCAFFOLD] on the way out', !saidScaffold(p3))

process.exit(report('Keep working (v2) — continuation coaching') === 0 ? 0 : 1)
