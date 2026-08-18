// A GROWN STORY — the shape no probe had ever built, and the one real students reach.
//
// Every other probe uses a single-type scaffold. Sierra's shape after she grows is MIXED:
// section 0 is `narrative` (hook/context/body/closing, all confirmed) and sections 1..N are
// `custom`, one labelled part each. That mix creates a specific hazard: the minted ids for
// the scenes are c0, c1 … while the finished narrative section holds `body` and `closing`.
//
// The fixture is built by calling the REAL growComponents(), never hand-written, so it
// cannot drift from what production actually stores.
//
// What the coach is shown for this scaffold today:
//     Working on: paragraph 2 of 3 (custom)
//     Components for current paragraph (0 of 1 confirmed):
//       c0: queued (not started)
// The word "Scene" appears nowhere — while the student's screen says "Scene 2", because
// TutorSession's sectionHeading() reads items[0].label. The label exists; the prompt
// simply never printed it.
//
// ~5 turns, roughly 6 cents.

import { coachTurn, check, report } from './lib/harness.mjs'
import { growComponents } from '../../lib/scaffoldGrowth.js'
// Leak checks must run on what the STUDENT sees. Control tokens carry ids by design and
// are stripped before display — scanning raw text failed a reply whose only "leak" was
// [ACTIVE:c2]. Use the shipped stripper, not a second idea of what a token looks like.
import { stripCoachTokens } from '../../lib/coachTokens.js'

const ASSIGNMENT = `Creative writing: a story about a squirrel facing a hard winter.
Tell it in scenes.`

const SCENE_ONE = {
  index: 0, type: 'narrative', status: 'complete', summary: 'the first cold morning at the oak',
  items: [
    { id: 'hook',    label: 'hook',    status: 'confirmed', text: 'The squirrel woke before the sun and counted four acorns.' },
    { id: 'context', label: 'context', status: 'confirmed', text: 'The cold had come early that year, the way his mother warned it would.' },
    { id: 'body',    label: 'body',    status: 'confirmed', text: 'He sat with his tail wrapped around him and watched the grey light come up.' },
    { id: 'closing', label: 'closing', status: 'confirmed', text: 'Four acorns would not last the week.' },
  ],
}

// Two taps of "+ Add another section" → Scene 2 and Scene 3, ids minted around the prose
// names already taken. This is where c0 comes from.
const grown = growComponents([SCENE_ONE], 2, { now: '2026-08-17T00:00:00Z' })
const SCENE_IDS = grown.components.slice(1).map(p => p.items[0].id)   // ['c0','c1']
const SCENE_LABELS = grown.components.slice(1).map(p => p.items[0].label) // ['Scene 2','Scene 3']

const onScene2 = {
  assignment_type: 'narrative',
  total_paragraphs: grown.components.length,
  current_paragraph_index: 1,
  components: grown.components,
}

const doneIds = t => [...t.matchAll(/\[DONE:([^:\]]*)[:\]]/g)].map(m => m[1])
// Prose ids that live in the FINISHED first section. Reaching for one of these is the
// symptom of not being able to see what the current section is called.
const STALE_PROSE_IDS = ['hook', 'context', 'body', 'closing']

console.log(`fixture from real growComponents(): scene ids ${JSON.stringify(SCENE_IDS)}, labels ${JSON.stringify(SCENE_LABELS)}\n`)

// ── PROBE 1 — lock scene two ────────────────────────────────────────────────────────
// Staged past Rule 17's named review pass, because that gate means a lock never fires on
// the turn the writing arrives — a probe that stops earlier asserts on zero locks and
// passes vacuously (learned the hard way in oversized-lock.mjs).
console.log('PROBE 1 — student finishes scene two and asks for it to go in')
const { text: p1 } = await coachTurn({
  assignment: ASSIGNMENT,
  scaffold: onScene2,
  messages: [
    { role: 'user', content: "ok here's the next bit. By the third morning the branch was bare and the four acorns were two. He knew the walnut trees were across the open field, and he knew about the hawk on the fence post." },
    { role: 'assistant', content: "That lands — the two acorns doing the counting for you, and the hawk sitting there as a fact rather than a threat. Quick read-over before it goes in: it's spare and it's yours. Happy with it as it stands?" },
    { role: 'user', content: "yeah put it in" },
    // A SECOND confirmation, because one was not enough to make the lock deterministic:
    // measured ~50% over four runs, the coach legitimately asking once more (Rule 17
    // permits it). The fix belongs in the fixture, not the assertion — "a lock actually
    // fired" is the check that stops every negative assertion below it from passing
    // vacuously, so weakening it would hollow out the probe. Mirrors oversized-lock.mjs
    // probe 2, which is stable for exactly this reason.
    { role: 'assistant', content: "Then I'll put it in as Scene 2 — say the word." },
    { role: 'user', content: "yep, lock it in" },
  ],
})
console.log('\n' + p1 + '\n' + '─'.repeat(70))
const ids1 = doneIds(p1)
check('P1: a lock actually fired — not vacuous', ids1.length >= 1, `${ids1.length} [DONE:]`)
check(`P1: locks with the SCENE's real id (${SCENE_IDS[0]})`,
  ids1.length > 0 && ids1.every(id => id === SCENE_IDS[0]),
  ids1.join(', ') || 'none')
check('P1: does not reach for a prose id from the finished first section',
  !ids1.some(id => STALE_PROSE_IDS.includes(id.toLowerCase())),
  ids1.filter(id => STALE_PROSE_IDS.includes(id.toLowerCase())).join(', '))
check('P1: never re-emits [SCAFFOLD] (it would erase scene one)', !/\[SCAFFOLD:/.test(p1))
check('P1: does not emit [COMPLETE] with a scene still empty', !/\[COMPLETE\]/.test(p1))

// ── PROBE 2 — can the coach NAME the section it is working on? ──────────────────────
// The direct test of the rendering gap. The student's screen says "Scene 2"; if the coach
// says "paragraph 2" or "the custom section", they are looking at different documents.
console.log('PROBE 2 — what does the coach call the section it is on?')
const { text: p2 } = await coachTurn({
  assignment: ASSIGNMENT,
  scaffold: onScene2,
  messages: [{ role: 'user', content: "wait which part are we on right now?" }],
})
console.log('\n' + p2 + '\n' + '─'.repeat(70))
// Accept the spelled-out form too. The first version of this check demanded the digit
// ("Scene 2") and failed a reply that said "scene two" — correct naming, wrong assertion.
check(`P2: calls it "${SCENE_LABELS[0]}" (or "scene two") — what the student's screen says`,
  /\bscenes?\s*(?:2|two)\b/i.test(p2))
check('P2: does not expose the internal id to the student', !new RegExp(`\\b${SCENE_IDS[0]}\\b`).test(stripCoachTokens(p2)))
check('P2: does not leak the internal type word "custom"', !/\bcustom\b/i.test(p2))

// ── PROBE 3 — revising the FINISHED first section ───────────────────────────────────
// Section 0 is complete, so a [DONE:] into it is refused by the app and nothing happens.
// Rule 20 says route it to Edit.
console.log('PROBE 3 — student wants to change a line in the finished scene one')
const { text: p3 } = await coachTurn({
  assignment: ASSIGNMENT,
  scaffold: onScene2,
  messages: [{ role: 'user', content: "can we change the first scene, i want the last line to say two acorns not four" }],
})
console.log('\n' + p3 + '\n' + '─'.repeat(70))
check('P3: routes the change to Edit rather than locking over a finished scene', /\bedit\b/i.test(p3))
check('P3: emits no [DONE:] the app would refuse', !/\[DONE:/.test(p3))
check('P3: never re-emits [SCAFFOLD]', !/\[SCAFFOLD:/.test(p3))

// ── PROBE 4 — THE CASE THE LABEL ACTUALLY DECIDES: an uploaded worksheet ────────────
// A grown story's labels are ordinals ("Scene 2" at index 1), so the coach can infer them
// from the paragraph number it is already shown — which is why probe 2 passed even before
// the labels were printed. A WORKSHEET's labels are not derivable from anything: c2 is
// "Star rating out of 5" and c3 is "Why you'd recommend it", and nothing but the label
// says which is which. This is where a coach that cannot see labels cannot coach at all.
console.log('PROBE 4 — uploaded worksheet: can the coach tell c2 from c3?')
const worksheet = {
  assignment_type: 'custom',
  total_paragraphs: 1,
  current_paragraph_index: 0,
  components: [{
    index: 0, type: 'custom', status: 'working', summary: null,
    items: [
      { id: 'c0', label: 'Book title',              status: 'confirmed', text: 'Hatchet' },
      { id: 'c1', label: 'Author',                  status: 'confirmed', text: 'Gary Paulsen' },
      { id: 'c2', label: 'Star rating out of 5',    status: 'locked', text: null },
      { id: 'c3', label: "Why you'd recommend it",  status: 'locked', text: null },
    ],
  }],
}
const { text: p4 } = await coachTurn({
  assignment: 'Book review worksheet. Fill in every field.',
  scaffold: worksheet,
  messages: [{ role: 'user', content: "ok what's next" }],
})
console.log('\n' + p4 + '\n' + '─'.repeat(70))
// The next queued field is c2, the STAR RATING. A coach that can see the label asks about
// a rating; one that cannot has to guess, and the likeliest guess is the recommendation.
check('P4: asks about the RATING — the field actually queued next',
  /\b(star|rating|out of (?:5|five)|how many stars|score)\b/i.test(p4))
check('P4: does not skip ahead to the recommendation field',
  !/\brecommend/i.test(p4) || /\b(star|rating|out of (?:5|five))\b/i.test(p4))
check('P4: does not expose the internal id to the student', !/\bc[0-9]\b/.test(stripCoachTokens(p4)))
check('P4: never re-emits [SCAFFOLD]', !/\[SCAFFOLD:/.test(p4))

process.exit(report('Grown story — mixed narrative + custom scenes') === 0 ? 0 : 1)
