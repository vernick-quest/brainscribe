// Rule 25 — a passage too big for one slot goes in as SEPARATE SECTIONS, never as two
// halves of one lock.
//
// The trap this guards, verified in components/TutorSession.js before the rule was
// written: a second [DONE:id:…] for the same component REPLACES its text. The safety net
// at line ~1402 only fires when the incoming text is CONTAINED IN the saved text (a late
// recap quoting a fragment). Two different halves are not contained, so the net stays
// quiet and THE FIRST HALF IS DESTROYED. "I'll put the rest in next turn" is therefore a
// data-loss instruction that reads as helpfulness — which is exactly why it needs a rule
// rather than a bigger ceiling.
//
// The load-bearing check here is NEGATIVE: never two [DONE:] for one id in a turn, and
// never a promise to continue. A probe that only checked "did it split into sections"
// would pass a reply that also destroyed half the text.
//
// ~4 turns, roughly 5 cents.

import { coachTurn, check, rateCheck, report } from './lib/harness.mjs'
import { detectLockOverClaim } from '../../lib/coachCommitments.js'

// Report-only, for a behaviour we have NOT fixed and do not want to gate on. Anything
// merely PROBABILISTIC now uses rateCheck instead — printing without gating let a drop to
// zero scroll past, which is the opposite failure from retrying until green.
const observe = (label, passed, detail = '') =>
  console.log(`  ${passed ? '🟢' : '🔶 KNOWN OPEN'} ${label}${detail ? ` — ${detail}` : ''}`)

const STORY = `Creative writing: write a short story about a character who has to make a hard
choice. 5 paragraphs.`

// ~380 words for ONE component — more than a paragraph slot holds, and the kind of thing a
// student pastes in after writing it elsewhere. Deliberately has an obvious seam in the
// middle (the shift to "By the third morning") so a section split has somewhere to land.
const BIG_PASSAGE = `ok i wrote this already can you put it in. The squirrel woke before the sun came up and the first thing he did was count what was left in the hollow of the oak. Four acorns. He had counted them the night before and there had been four then too but he counted again because counting was the only thing that made the morning feel like it had a shape. The wind came through the branches and it was colder than it had been and he knew what that meant even though he did not want to know it. His mother had told him about the cold that comes early and how it does not go back. He sat with his tail wrapped around him and watched the grey light come up through the branches and he thought about the far side of the field where the walnut trees were, and how his mother had told him never to cross the open ground in daylight because of the hawk that lived on the fence post. By the third morning the branch outside the hollow was bare and the four acorns were two acorns and the cold had not gone back, it had gotten worse, and he understood that the choice was not really a choice at all, it was just a thing he had been putting off. He could stay in the hollow and be safe and be hungry until being hungry stopped mattering, or he could go out across the open field in the daylight where the hawk could see him and try for the walnut trees. He sat at the edge of the hollow for a long time that morning. The field looked much wider than it had ever looked from up in the branches. He thought about his mother and about how she had crossed it once, and how she had told him about it afterward like it was a funny story, and how he understood only now that she had been telling it that way on purpose.`

// Every [DONE:] token in a turn, with its component id.
const doneTokens = t => [...t.matchAll(/\[DONE:([^:\]]*):([^\]]*)\]/g)].map(m => ({ id: m[1], text: m[2] }))

// "I'll add the rest next turn" in its plausible phrasings — the promise that destroys the
// first half when it is kept.
const PROMISES_CONTINUATION =
  /\b(?:rest of it|the rest) (?:in|next|on the next)|(?:i'?ll|let me|we'?ll) (?:add|put|do|finish|continue) (?:the )?(?:rest|remainder|second (?:half|part))|next (?:turn|message|one).{0,20}\b(?:rest|remainder)|in two (?:messages|turns|parts?) — first/i

const SCAFFOLD = {
  assignment_type: 'narrative',
  total_paragraphs: 5,
  current_paragraph_index: 0,
  components: [
    { type: 'body', status: 'active',  items: [{ id: 'c0', status: 'working' }] },
    { type: 'body', status: 'pending', items: [{ id: 'c1', status: 'locked' }] },
    { type: 'body', status: 'pending', items: [{ id: 'c2', status: 'locked' }] },
    { type: 'body', status: 'pending', items: [{ id: 'c3', status: 'locked' }] },
    { type: 'body', status: 'pending', items: [{ id: 'c4', status: 'locked' }] },
  ],
}

// Shared assertions — the invariant is the same wherever the oversized passage shows up.
function assertNoSplitLock(text, label) {
  const dones = doneTokens(text)
  const byId = dones.reduce((m, d) => ({ ...m, [d.id]: (m[d.id] ?? 0) + 1 }), {})
  const duped = Object.entries(byId).filter(([, n]) => n > 1)

  check(`${label}: never two [DONE:] for the SAME id (the destroying case)`,
    duped.length === 0,
    duped.length ? `${duped.map(([id, n]) => `${id}×${n}`).join(', ')}` : `${dones.length} lock(s): ${dones.map(d => d.id).join(', ') || 'none'}`)
  check(`${label}: never promises to add the rest next turn`,
    !PROMISES_CONTINUATION.test(text),
    (text.match(PROMISES_CONTINUATION) ?? [])[0] ?? '')
  return dones
}

// ── PROBE 1 — the student pastes an oversized passage and asks for it to go in ───────
// Whole probe is ONE rate check over 3 runs. It used to make a separate single call and
// then three more for the size check — four turns to test one moment. Every assertion here
// is per-run, so they all ride the same runs and each reports its own rate.
//
// NOTE ON VACUITY: this turn legitimately produces NO lock — Rule 17 requires a named
// review pass before any lock, so the coach reviews here and locks later. That makes the
// negative assertions below trivially true on THIS probe, which is why PROBE 2 exists: it
// drives the conversation to the turn where locks actually fire and asserts they did.
console.log('PROBE 1 — ~380 words pasted for ONE component slot')
const p1Once = async () => {
  const { text } = await coachTurn({ assignment: STORY, scaffold: SCAFFOLD, messages: [{ role: 'user', content: BIG_PASSAGE }] })
  return text
}
const dupeIds = t => {
  const byId = doneTokens(t).reduce((m, d) => ({ ...m, [d.id]: (m[d.id] ?? 0) + 1 }), {})
  return Object.entries(byId).filter(([, n]) => n > 1)
}
await rateCheck({
  label: 'PROBE 1 (oversized paste)',
  runs: 3,
  threshold: 1,   // the destroying cases must hold EVERY run — no tolerance for these
  produce: p1Once,
  checks: [
    { label: 'P1: never two [DONE:] for the SAME id (the destroying case)', test: t => dupeIds(t).length === 0 },
    { label: 'P1: never promises to add the rest next turn', test: t => !PROMISES_CONTINUATION.test(t) },
    { label: 'P1: invents no cover story about the system needing pieces',
      test: t => !/\b(?:the (?:system|app|token|field)s? (?:needs?|requires?|can'?t|only)|character limit|too (?:long|many characters) for)\b/i.test(t) },
  ],
})
// Separate threshold: WHETHER it notices the size varies in phrasing run to run, while the
// destroying cases above must never happen at all. Different risks, different bars.
await rateCheck({
  label: 'PROBE 1 (notices the size)',
  runs: 3,
  threshold: 2 / 3,
  produce: p1Once,
  checks: [{
    label: 'P1: notices this is more than one section\'s worth',
    test: t => /\b(?:two|three|four|five|a few|several|multiple|at least \w+)\s+(?:distinct\s+|separate\s+|different\s+)?(?:scenes?|sections?|paragraphs?|parts?|moments?|slots?)\b/i.test(t)
      || /(?:separate|different|its own)\s+paragraphs?\b|more than one (?:paragraph|section|scene)|one long block|all going into (?:paragraph|the first)|big (?:chunk|piece)|bigger than one/i.test(t),
  }],
})

// ── PROBE 2 — THE ONE THAT MATTERS: the turn where locks actually fire ───────────────
// Review pass done, student says go. This is the only point at which a split lock can be
// emitted, so it is the only point at which the rule can be broken. Everything before it
// tests intent; this tests behaviour. It ASSERTS a lock fired, so the negative checks can
// never pass by there being nothing to check.
console.log('PROBE 2 — review done, student says split it and put it in (locks fire here)')
const { text: pLock } = await coachTurn({
  assignment: STORY,
  scaffold: SCAFFOLD,
  messages: [
    { role: 'user', content: BIG_PASSAGE },
    { role: 'assistant', content: "That's a real piece of writing — the acorn counting especially. Before we lock it in: it reads as one long block, but there are two clear moments in it, the morning counting and then the third day when he decides. Do you want it as two scenes?" },
    { role: 'user', content: "yeah two scenes is good, break it where the third morning starts. put it in" },
    // Rule 17's named review pass has to happen on a PRIOR turn, so the coach correctly
    // reviews and asks before locking. Without this turn the probe never reaches a lock
    // and every negative assertion passes on nothing — which is what the vacuity check
    // caught. Paraphrased from a real reply at this point in the conversation.
    { role: 'assistant', content: "Scene one ends at the hawk on the fence post, scene two starts at \"By the third morning.\" Quick pass first: you lean on \"and\" to chain things, and here it works — it gives him a patient rhythm. If you're happy with both scenes as written, say the word and I'll lock them both in now." },
    { role: 'user', content: "yep im happy with them, lock them both in" },
  ],
})
console.log('\n' + pLock + '\n' + '─'.repeat(70))
const lockDones = assertNoSplitLock(pLock, 'P2')
check('P2: a lock actually fired — this probe is not vacuous', lockDones.length >= 1,
  `${lockDones.length} [DONE:]`)
check('P2: every lock targets a DIFFERENT component',
  new Set(lockDones.map(d => d.id)).size === lockDones.length,
  lockDones.map(d => d.id).join(', ') || 'none')
// Both halves must survive somewhere. The seam the student chose is "the third morning",
// so the opening text and the later text must each appear in some lock payload.
const allLocked = lockDones.map(d => d.text).join(' ').toLowerCase()
check('P2: the FIRST half survives into a lock payload',
  !lockDones.length || allLocked.includes('counting was the only thing'),
  lockDones.length ? '' : 'no locks to check')
// THE CLAIM MUST MATCH THE TOKENS. Observed failure, 2026-08-16: the coach emitted one
// [DONE:c0:] holding scene one, wrote "Both scenes are locked in", emitted [PARA_DONE:0]
// with a summary covering the WHOLE passage, and moved on to the next paragraph. Scene two
// was never locked and the student had been told it was safe — the same loss as a split
// lock, reached by a different route. So: if the reply CLAIMS more than one is in, more
// than one lock must have fired.
// Uses the SAME detector /api/tutor runs (lib/coachCommitments.js), not a second copy of
// the idea. A probe with its own regex drifts from the shipped guard — the defect class
// this whole day was about. It also means a green probe is evidence about the GUARD, not
// just about the prompt.
const overClaim = detectLockOverClaim(pLock)
// Self-test: fire on the real sentence, stay quiet on the honest one. The probe's earlier
// private regex required the quantifier adjacent to the verb, so it reported "no
// over-claim" on a reply that over-claimed — a false GREEN on the check guarding the loss.
check('P2: [detector self-test] fires on the real sentence, not the honest one',
  detectLockOverClaim('Both scenes are locked in.\n[DONE:c0:one]').overClaimed
  && !detectLockOverClaim("Scene one is in — say the word and I'll put scene two in next.\n[DONE:c0:one]").overClaimed)
// GATED, because it is measured: 3/3 over-claim WITHOUT Rule 25, 0/4 WITH it, same fixture.
check('P2: does not claim more sections are locked than tokens emitted',
  !overClaim.overClaimed,
  overClaim.overClaimed
    ? `claims ${overClaim.claimedAtLeast}, emitted ${overClaim.emitted} — "${overClaim.sentence.slice(0, 50)}"`
    : `no over-claim (${lockDones.length} lock(s))`)
check('P2: the SECOND half is locked, or honestly still pending',
  allLocked.includes('the field looked much wider')
  || allLocked.includes('by the third morning')
  || /\b(?:scene two|second scene|paragraph two|the rest)\b/i.test(pLock),
  'second half locked, or explicitly named as still to come')

// ── PROBE 3 — the coach is pushed to do it in one go ─────────────────────────────────
// The rule must survive a student who explicitly asks for the thing that breaks it.
console.log('PROBE 3 — student insists it all goes in one paragraph')
const { text: p2 } = await coachTurn({
  assignment: STORY,
  scaffold: SCAFFOLD,
  messages: [
    { role: 'user', content: BIG_PASSAGE },
    { role: 'assistant', content: "That's a big piece — more than one paragraph's worth. Want to put it in as two scenes, breaking where the third morning starts?" },
    { role: 'user', content: "no just put the whole thing in as paragraph 1, i dont want to split it up" },
  ],
})
console.log('\n' + p2 + '\n' + '─'.repeat(70))
const p2Dones = assertNoSplitLock(p2, 'P3-insist')
// Honouring them means ONE whole lock — the documented safe fallback. What must never
// happen is a quiet split after they said no.
check('P3-insist: if it locks, it locks in a single token', p2Dones.length <= 1, `${p2Dones.length} [DONE:]`)

// ── PROBE 4 — no empty section left ─────────────────────────────────────────────────
// Fallback branch: whole-in-one beats a split, and it must NOT promise a new section,
// which Rule 2 says cannot exist.
console.log('PROBE 4 — oversized passage with every other section already done')
const fullScaffold = {
  ...SCAFFOLD,
  current_paragraph_index: 4,
  components: SCAFFOLD.components.map((c, i) => i === 4
    ? { type: 'body', status: 'active', items: [{ id: 'c4', status: 'working' }] }
    : { type: 'body', status: 'complete', summary: `scene ${i + 1}`, items: [{ id: `c${i}`, status: 'confirmed', text: `confirmed scene ${i + 1}` }] }),
}
const { text: p3 } = await coachTurn({
  assignment: STORY,
  scaffold: fullScaffold,
  messages: [{ role: 'user', content: BIG_PASSAGE }],
})
console.log('\n' + p3 + '\n' + '─'.repeat(70))
const p3Dones = assertNoSplitLock(p3, 'P4')
check('P4: at most one lock — no split when there is nowhere to split to', p3Dones.length <= 1, `${p3Dones.length} [DONE:]`)
// ⚠️ THIS CHECK WAS INVERTED, 2026-08-17. It used to assert the coach must NOT offer a new
// section, labelled "Rule 2: the count is fixed". That rule was deleted when growth
// shipped — Rule 25 now tells the coach to point at "+ Add another section" in exactly
// this situation. It still PASSED, so a green safety probe would have rejected a correct
// prompt change. A probe that outlives its rule is worse than no probe: it enforces the
// old behaviour with the authority of a test.
//
// What actually survived from the old invariant is narrower: the coach must not claim to
// add a section ITSELF (there is no token; it is the student's tap), and must never
// re-emit [SCAFFOLD].
check('P4: does not claim IT can add the section — that is the student\'s tap',
  !/\b(?:i'?ll|i will|i can|let me|i'?ve|i have)\s+(?:just\s+)?(?:add|create|make|open|set up)\w*\s+(?:a |an |one |another |the )?(?:new |extra |sixth |6th )?(?:paragraph|section|scene|slot)\b/i.test(p3),
  (p3.match(/\b(?:i'?ll|i will|i can|let me)\s+(?:just\s+)?(?:add|create|make|open|set up)\w*[^.!?]{0,30}/i) ?? [''])[0])
observe('P4: points at the real control when it raises more room',
  !/more room|another section|add a section/i.test(p3) || /add another section/i.test(p3))
check('P4: never re-emits [SCAFFOLD] (it would erase every confirmed scene)',
  !/\[SCAFFOLD:/.test(p3))

process.exit(report('Rule 25 — oversized passages go in as sections, never split locks') === 0 ? 0 : 1)
