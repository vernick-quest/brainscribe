// Rule 2 (ADDING A SECTION LATER) + Rule 20 (a refused write) — against the real model.
//
// P0 CONTEXT: growth shipped in coaching-session (student button "+ Add another section" →
// /api/scaffold/[sessionId]/grow, append-only, server-side). Until this landed, the prompt
// asserted in SIX places that the count could never change. A grown session therefore
// produced sections the coach would actively tell the student could not exist — worse than
// not growing it, because the student gets visible evidence the app contradicts itself.
//
// So the failing direction here is DENIAL: the coach saying a new paragraph is impossible,
// or re-emitting [SCAFFOLD] to make room (which erases every locked section).
//
// ~5 turns, roughly 6 cents.

import { coachTurn, check, report } from './lib/harness.mjs'

const ESSAY = `Persuasive essay: should the school day start later? 3 paragraphs.`
const STORY = `Creative writing: a short story about a hard choice. Tell it in scenes.`

const confirmed = (id, text) => ({ id, status: 'confirmed', text })
const emptyItem  = id => ({ id, status: 'locked', text: null, nuggetText: null })

// Every section full: a finished 3-paragraph essay, cursor parked past the end.
const FULL = {
  assignment_type: 'essay',
  total_paragraphs: 3,
  current_paragraph_index: 3,
  thesis: 'School should start later.',
  components: [
    { type: 'introduction', status: 'complete', summary: 'sets up the argument',
      items: [confirmed('hook', 'I fell asleep in first period again.'), confirmed('context', 'Our school starts at 7:30.')] },
    { type: 'body', status: 'complete', summary: 'sleep research',
      items: [confirmed('topic_sentence', 'Teenagers need more sleep than adults.'), confirmed('evidence', 'Doctors say we need nine hours.')] },
    { type: 'conclusion', status: 'complete', summary: 'wraps up',
      items: [confirmed('echo', 'First period should not be a nap.'), confirmed('closing', 'Let us start later.')] },
  ],
}

// The SAME scaffold after one tap of "+ Add another section": an empty body appended at the
// end, cursor UNMOVED (growth never yanks the coach out of where it is working).
const GROWN = {
  ...FULL,
  total_paragraphs: 4,
  components: [
    ...FULL.components,
    { index: 3, type: 'body', status: 'locked', summary: null, grownAt: '2026-08-17T00:00:00Z',
      items: ['topic_sentence', 'evidence', 'analysis', 'transition'].map(emptyItem) },
  ],
}

const DENIES_GROWTH =
  /\b(?:can'?t|cannot|can not|no way to|not possible|isn'?t possible|unable to|there'?s no)\b[^.!?\n]{0,60}\b(?:add|adding|another|more|new|extra|fourth|4th)\b[^.!?\n]{0,30}\b(?:paragraph|section|scene)\b|\b(?:paragraph|section) count is (?:fixed|set)|(?:can'?t|cannot) be added to this draft|locked (?:in )?(?:at|to) (?:three|3|four|4)/i

// The real control, named as the student sees it.
const NAMES_THE_BUTTON = /add another section|\+\s*add another/i

// ── PROBE 1 — every section full, and they have more to say ─────────────────────────
console.log('PROBE 1 — finished 3-paragraph essay, student wants a fourth paragraph')
const { text: p1 } = await coachTurn({
  assignment: ESSAY,
  scaffold: FULL,
  messages: [{ role: 'user', content: "i thought of another reason, about sports practice being too early. can i add another paragraph about that" }],
})
console.log('\n' + p1 + '\n' + '─'.repeat(70))
check('P1: does NOT tell the student a section cannot be added', !DENIES_GROWTH.test(p1),
  (p1.match(DENIES_GROWTH) ?? [])[0] ?? '')
check('P1: points at the real control by name', NAMES_THE_BUTTON.test(p1))
check('P1: never re-emits [SCAFFOLD] to make room (it would erase everything)',
  !/\[SCAFFOLD:/.test(p1))
check('P1: does not emit [COMPLETE] to dodge the request', !/\[COMPLETE\]/.test(p1))

// ── PROBE 2 — the section now exists; coach must use it, not deny it ────────────────
console.log('PROBE 2 — the student tapped it; an empty 4th section is now in the scaffold')
const { text: p2 } = await coachTurn({
  assignment: ESSAY,
  scaffold: GROWN,
  messages: [
    { role: 'user', content: "i thought of another reason about sports practice. can i add another paragraph" },
    { role: 'assistant', content: "Tap \"+ Add another section\" under your draft and we'll build it together." },
    { role: 'user', content: "ok i did it" },
  ],
})
console.log('\n' + p2 + '\n' + '─'.repeat(70))
check('P2: does NOT deny the new section exists', !DENIES_GROWTH.test(p2),
  (p2.match(DENIES_GROWTH) ?? [])[0] ?? '')
check('P2: never re-emits [SCAFFOLD]', !/\[SCAFFOLD:/.test(p2))
check('P2: starts coaching the new paragraph rather than closing the session',
  !/\[COMPLETE\]/.test(p2))
// It must not claim the empty section holds anything (Rule 20).
check('P2: does not describe the new section as already written',
  !/\b(?:fourth|4th|new) (?:paragraph|section)\b[^.!?\n]{0,40}\b(?:is|looks) (?:done|complete|locked|great|strong)\b/i.test(p2))

// ── PROBE 3 — the refused write (P1 item): aiming at a FINISHED paragraph ───────────
// The app refuses a [DONE:] into an already-assembled paragraph and says nothing back, so
// the coach must route the change to Edit rather than emit a token that vanishes.
console.log('PROBE 3 — student wants to change a paragraph that is already finished')
const { text: p3 } = await coachTurn({
  assignment: ESSAY,
  scaffold: FULL,
  messages: [{ role: 'user', content: "i want to change my second paragraph, the sleep one — i want to say we need nine and a half hours not nine" }],
})
console.log('\n' + p3 + '\n' + '─'.repeat(70))
check('P3: routes the change to Edit rather than locking over a finished paragraph',
  /\bedit\b/i.test(p3))
check('P3: does not emit a [DONE:] that the app would refuse', !/\[DONE:/.test(p3))
check('P3: never re-emits [SCAFFOLD]', !/\[SCAFFOLD:/.test(p3))

// ── PROBE 4 — a story that outgrew its structure (the Sierra shape) ─────────────────
console.log('PROBE 4 — one-section story, student has another scene and nowhere to put it')
const oneScene = {
  assignment_type: 'custom',
  total_paragraphs: 1,
  current_paragraph_index: 0,
  components: [
    { type: 'custom', status: 'complete', summary: 'scene one',
      items: [confirmed('c0', 'The squirrel counted four acorns in the cold and knew the winter had come early.')] },
  ],
}
const { text: p4 } = await coachTurn({
  assignment: STORY,
  scaffold: oneScene,
  messages: [{ role: 'user', content: "ok scene one is done. i have three more scenes to write, where do they go" }],
})
console.log('\n' + p4 + '\n' + '─'.repeat(70))
check('P4: does NOT tell the student the scenes have nowhere to go', !DENIES_GROWTH.test(p4),
  (p4.match(DENIES_GROWTH) ?? [])[0] ?? '')
check('P4: points at the real control by name', NAMES_THE_BUTTON.test(p4))
check('P4: never re-emits [SCAFFOLD] (it would erase scene one)', !/\[SCAFFOLD:/.test(p4))

process.exit(report('Rule 2 growth + Rule 20 refused write') === 0 ? 0 : 1)
