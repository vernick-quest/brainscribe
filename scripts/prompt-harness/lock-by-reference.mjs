// Lock by reference — does the model emit a form the CLIENT CAN ACTUALLY RESOLVE?
//
// SPEC-lock-by-reference.md. The prompt block is behind opts.lockByReference and is OFF in
// production until focus/coaching-session wires lib/lockByReference.js into the write path.
// This probe runs it ON, which is the only honest way to know the prompt works before the
// flag flips — and the flip is a one-line change nobody should make on faith.
//
// THE LOAD-BEARING CHECK IS NOT "did it emit an anchored token". It is: feed the token the
// model actually produced into the REAL resolver, against the REAL student message, and
// assert the resolved text is byte-identical to a substring of what the student wrote. A
// probe that only pattern-matched the token shape would pass on anchors that resolve to
// the wrong span — and a wrong span is worse than a failed lock, because it looks finished.
//
// ~4 turns, roughly 5 cents.

import { coachTurn, check, report } from './lib/harness.mjs'
import { parseLockPayload, resolveLockPayload } from '../../lib/lockByReference.js'

const ASSIGNMENT = `Creative writing: a story about two squirrels and a hard winter.
Tell it in scenes.`

// A pasted passage long enough that echoing it is the problem the spec exists to solve,
// with a deliberately repeated opening phrase ("And then") to make a lazy anchor ambiguous.
const PASTED = `here's the whole scene i wrote last night. One and Two hopped tentatively out onto the frozen branch, testing it with their front paws before trusting any of their weight to it. The bark had gone hard and slick overnight and the whole tree seemed to have forgotten them. And then the wind came up from the field and they both flattened themselves without deciding to. And then it passed, and they went on, one behind the other, until they reached the split where the old nut store had been packed away in autumn and left to keep. It was still there. They spent the rest of the grey afternoon gnawing off big chunks of nut.`

const SCAFFOLD = {
  assignment_type: 'narrative',
  total_paragraphs: 2,
  current_paragraph_index: 0,
  components: [
    { index: 0, type: 'narrative', status: 'working', items: [
      { id: 'hook',    label: 'hook',    status: 'confirmed', text: 'The cold came early that year.' },
      { id: 'body',    label: 'body',    status: 'working',   text: null, nuggetText: null },
      { id: 'closing', label: 'closing', status: 'locked',    text: null, nuggetText: null },
    ] },
    { index: 1, type: 'custom', status: 'locked', items: [{ id: 'c0', label: 'Scene 2', status: 'locked' }] },
  ],
}

const OPTS = { lockByReference: true }
const doneTokens = t => [...t.matchAll(/\[DONE:([^:\]]*)(?::([^\]]*))?\]/g)].map(m => ({ id: m[1], payload: m[2] ?? '' }))

// ── PROBE 1 — typed/pasted prose should produce an ANCHORED lock that RESOLVES ───────
console.log('PROBE 1 — student pasted a long scene; lock it by reference')
const userMessages = [PASTED, 'yep looks right, put it in']
const { text: p1 } = await coachTurn({
  assignment: ASSIGNMENT,
  scaffold: SCAFFOLD,
  opts: OPTS,
  messages: [
    { role: 'user', content: PASTED },
    { role: 'assistant', content: "That's a real scene — the branch testing and the wind landing before they decide to react. Quick read-over before it goes in: it's yours as written. Happy with it?" },
    { role: 'user', content: 'yep looks right, put it in' },
  ],
})
console.log('\n' + p1 + '\n' + '─'.repeat(70))

const toks = doneTokens(p1)
check('P1: a lock actually fired — not vacuous', toks.length >= 1, `${toks.length} [DONE:]`)

const parsed = toks.map(t => ({ ...t, ...parseLockPayload(t.payload) }))
for (const t of parsed) console.log(`   [DONE:${t.id}] -> ${t.kind}${t.kind === 'anchored' ? ` "${t.start}" … "${t.end}"` : ''}`)

const anchored = parsed.filter(t => t.kind === 'anchored')
check('P1: uses the ANCHORED form for pasted prose rather than echoing it',
  anchored.length >= 1, parsed.map(t => t.kind).join(', ') || 'none')

// The payload must stop scaling with the student's writing — the entire point.
if (anchored.length) {
  const payloadWords = anchored[0].payload.trim().split(/\s+/).length
  const passageWords = PASTED.trim().split(/\s+/).length
  check(`P1: payload stays small (${payloadWords} words for a ${passageWords}-word passage)`,
    payloadWords <= 30, `${payloadWords} words`)
}

// 🔴 THE CONTRACT CHECK. Run the model's own token through the REAL resolver.
for (const t of anchored) {
  const res = resolveLockPayload(t.payload, userMessages)
  check(`P1: the emitted anchor RESOLVES via lib/lockByReference.js`, res.ok === true,
    res.ok ? `${res.text.trim().split(/\s+/).length} words from message ${res.messageIndex}` : `${res.reason}: ${res.detail ?? ''}`)
  if (res.ok) {
    check('P1: the resolved span is byte-identical to a substring of the student\'s message',
      PASTED.includes(res.text), res.text.slice(0, 45) + '…')
    check('P1: the span is the real passage, not a sliver',
      res.text.trim().split(/\s+/).length >= 60, `${res.text.trim().split(/\s+/).length} words`)
    check('P1: the resolved span contains no words the student did not write',
      PASTED.indexOf(res.text) >= 0)
  }
}

check('P1: does not narrate the anchors to the student',
  !/anchor|reference|first few words|plumbing/i.test(p1.replace(/\[[^\]]*\]/g, '')))

// ── PROBE 2 — the anchor must be UNIQUE, and "And then" is not ──────────────────────
// Whatever anchor it picked, resolution must not be ambiguous. This is where a wrong span
// comes from, and the resolver is built to refuse — so a refusal here is a PASS for the
// resolver and a miss for the prompt. Assert the prompt avoided it.
console.log('PROBE 2 — anchor uniqueness against a repeated opening phrase')
for (const t of anchored) {
  const occurrences = PASTED.split(t.start).length - 1
  check(`P2: start anchor "${t.start.slice(0, 32)}" appears exactly once`, occurrences === 1, `${occurrences} occurrence(s)`)
}
check('P2: did not choose the repeated phrase "And then" as an anchor',
  !anchored.some(t => t.start.trim().toLowerCase().startsWith('and then')))

// ── PROBE 3 — dictation should use the BARE form, with no payload ───────────────────
console.log('PROBE 3 — dictated text: the app already holds it, so name the slot only')
const { text: p3 } = await coachTurn({
  assignment: ASSIGNMENT,
  scaffold: {
    ...SCAFFOLD,
    components: [{ ...SCAFFOLD.components[0], items: [
      { id: 'hook', label: 'hook', status: 'confirmed', text: 'The cold came early that year.' },
      { id: 'body', label: 'body', status: 'candidate', text: null,
        nuggetText: 'They crossed the branch together and found the store still packed away where they left it.' },
      { id: 'closing', label: 'closing', status: 'locked', text: null },
    ] }, SCAFFOLD.components[1]],
  },
  opts: OPTS,
  messages: [
    { role: 'user', content: '[spoken] they crossed the branch together and found the store still packed away where they left it' },
    { role: 'assistant', content: "Good — that's the beat the scene needed. Reading it back: they cross together, and the store is still there. Lock it as your body?" },
    { role: 'user', content: 'yes lock it' },
  ],
})
console.log('\n' + p3 + '\n' + '─'.repeat(70))
const t3 = doneTokens(p3).map(t => ({ ...t, ...parseLockPayload(t.payload) }))
for (const t of t3) console.log(`   [DONE:${t.id}] -> ${t.kind}`)
check('P3: a lock fired', t3.length >= 1, `${t3.length} [DONE:]`)
check('P3: uses the BARE form for dictation — no echoed payload',
  t3.length > 0 && t3.every(t => t.kind === 'bare'), t3.map(t => t.kind).join(', ') || 'none')

process.exit(report('Lock by reference — forms the client can resolve') === 0 ? 0 : 1)
