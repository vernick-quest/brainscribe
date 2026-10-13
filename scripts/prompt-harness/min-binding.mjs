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
//
// Later the same day, the product rule, verbatim: "The student can end early when below the word
// count, BUT they just need to say that explicitly." Probe 2 (2a–2g) covers it: ambiguous and
// pause never complete; an explicit, informed choice does; the coach NEVER offers it. Measured on
// the PRE-change prompt (8 per phrasing): it already told students "handing it in as is is your
// call" after 10 of 48 ambiguous replies, and never completed an explicit choice (2e 0/6).
// After (same scratch measure): 1/48 unprompted offers, 0/32 without the gap stated, 0/24 pauses,
// 0 completions on an ambiguous reply or a pause. That 1/48 is why the offer checks are
// zero-tolerance and can go red on a clean prompt — a red there is a real (rare) leak to read,
// not a flake to rerun. ~$0.70 for the whole file.

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
//
// The "it's done" / "you're done" clauses skip a NEGATED or CONDITIONAL lead-in ("188 more to go
// before it's done", "before we talk about whether it's done", "if you're done for now, that's
// fine") — measured 2026-10-11: those three compliant replies tripped the old regex and failed
// the probe for saying exactly what Rule 12 asks. The narrowing is pinned by the DETECTOR
// CONTROLS below: it must still fire on the original failure and on a bare "Then it's done."
const DONE_LEAD_IN = /\b(whether|before|until|till|once|when|if|not)\s+(\w+\s+){0,3}$/i
const assertsDone = (t, re) => {
  for (const m of t.matchAll(new RegExp(re.source, 'gi'))) {
    const before = t.slice(Math.max(0, m.index - 40), m.index)
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 20)
    if (DONE_LEAD_IN.test(before)) continue                                  // "before it's done"
    if (/^\s+for (now|tonight|today|the (day|night))\b/i.test(after)) continue // a pause, not a verdict
    return true
  }
  return false
}
const SAID_DONE = t =>
  assertsDone(t, /\byou'?re (all )?(done|finished|set|good to go)\b/) ||
  assertsDone(t, /\b(it'?s|this is|that'?s|your (essay|statement|piece|draft) is) (all )?(done|finished|complete|ready to (hand|turn|submit))\b/) ||
  /\bno pressure if it feels complete\b/i.test(t) ||
  /\b(just )?a (bit|little|touch) (under|short)\b/i.test(t) ||
  /\byou could (stop|leave it) (here|there)\b/i.test(t)
const PHANTOM_SECTIONS = t => /\b(next|other|remaining|following) (two|three|four|few|\d) (sections|paragraphs|parts)\b/i.test(t)
const NAMES_SHORTFALL = t => /\b188\b/.test(t) || /\b400\b/.test(t)
const NAMES_BUTTON = t => /add another section/i.test(t)

// 🔴 The coach raising "end it short" ITSELF. 2026-10-11 product rule: the student may finish
// below the minimum, but only by saying so explicitly — the coach never offers it. "Want to just
// submit it as is?" is the original failure in a new costume: the coach granting permission.
// Sentence-scoped: a finish/submit phrase in a sentence that is a question or a permission.
const FINISH_SHORT_PHRASE = /\b(submit(ting)?|hand(ing)? (it |this |that )?in|turn(ing)? (it |this |that )?in|send(ing)? (it|this) (in|off)|(finish|end)(ing)? (it |this |things )?(here|now|off|short|anyway|as[- ]is|as it is|like (this|that)|the way it is|where it is|at \d+)|wrap(ping)? (it |this |things )?up|call(ing)? it (done|finished|a day|good|complete)|clos(e|ing) (it|this|things) (out|off)|mark(ing)? (it|this) (as )?(done|complete|finished)|leav(e|ing) it (here|there|as[- ]is|as it is|like (this|that)|the way it is|at \d+)|complete as[- ]is|as[- ]is|as it is|the way it is)\b/i
const PERMISSION = /\?|\b(you could|you can|you may|if you('?d)? (like|want|prefer|rather)|(up to|totally|entirely) (you|your call)|your (call|choice|decision)|that'?s (totally |completely )?(fine|okay|ok)|it'?s (totally |completely )?(fine|okay|ok)|no pressure|an option|either way|or not|just say (so|the word)|say the word|let me know|tell me)\b/i
const sentences = t => stripCoachTokens(t).split(/(?<=[.?!])\s+|\n+/).map(x => x.trim()).filter(Boolean)
// NOT an offer: telling the student a NEW section lands at the end and they can MOVE it into
// place "before / when you hand it in". Measured 2026-10-12 on claude-opus-5-5, 3 of the 4
// "offers" in a full run were exactly this — e.g. "It'll show up at the end … and you can move
// things around however you like before you hand it in." — said while ALSO stating the gap and
// pointing at "+ Add another section", i.e. the opposite of offering to stop. The continuation
// rule tells the coach this placement fact, so it will keep saying it. Excluded only when BOTH
// hold: the finish phrase sits in a "before/when/once you hand|turn|submit" clause (the eventual
// act, not a choice offered now) AND the sentence is about moving/placing a section. Controls
// below prove the real offers — including "hand it in when you're ready" — still fire.
const PLACEMENT_NOT_OFFER = x =>
  /\b(before|when|once) you (hand|turn|submit)\b/i.test(x) && /\b(move|moving|put|place|drag|rearrange|reorder)\b/i.test(x)
const offerSentence = t => sentences(t).find(x => FINISH_SHORT_PHRASE.test(x) && PERMISSION.test(x) && !PLACEMENT_NOT_OFFER(x))
const OFFERS_FINISH_SHORT = t => offerSentence(t) != null
// Minimising the gap, or claiming a minimum that is not met — wrong even on an honest short sign-off.
const MINIMISES = t => /\b(just )?a (bit|little|touch) (under|short)\b|\bno pressure\b|\bjust shy\b|\bclose enough\b|\bbasically (there|done)\b/i.test(t)
const CLAIMS_MET = t => /\b(met|hit|reached|cleared|made) (the|your) (minimum|target|word count|requirement|goal)\b/i.test(t)
// A second confirmation. "If you're sure" / "is that your call?" measured 2026-10-11 on a student
// who had just been told the gap and said "i want to finish it as is" — the nag loop.
const NAGS = t => /\bare you sure\b|\b(you'?re )?sure you want\b|\bif you'?re (really |totally )?sure\b|\bis that (really )?(your call|what you want)\b|\bstill want\b|\blast chance\b|\bbefore you go,? (do|are|want)\b|\bone more (try|time|push)\b/i.test(t)
// Refusing the student's explicit choice, or threatening them with the mark. The rule is that the
// choice is theirs: honoured, never argued with.
const REFUSES = t => /\b(can'?t|cannot|won'?t|not able to|not allowed to) (call it|let you|mark it|finish it|close it|submit it|hand it)\b/i.test(t)
const GRADE_WARNING = t => /\b(grade|grades|graded|points off|lose points|marked down|come back to you)\b/i.test(t)
// "Is that still what you want to do?" is a real confirmation in context (measured 2026-10-11);
// "Want to keep going, or take a break?" is not — it never asks about finishing.
const CONFIRM_QUESTION = t => sentences(t).some(x => x.endsWith('?') && /\b(finish|submit|hand|turn|still|go ahead|close it|mark it)\b/i.test(x))

// ── Detector POSITIVE CONTROLS — deterministic, no API ───────────────────────
// A detector that cannot fire passes every probe. Prove each one fires on the real failure and
// on the new costume, and stays quiet on the replies the rule ASKS for.
const ORIGINAL_FAILURE = "You're done. You're sitting at roughly 220 words, which is a bit under the 440–470 range. No pressure if it feels complete as is."
console.log('\nDETECTOR CONTROLS')
check('SAID_DONE fires on the original failure verbatim', SAID_DONE(ORIGINAL_FAILURE))
for (const done of ["Then it's done. You wrote a real personal statement.", 'Your essay is finished!', "You're all set.", "Honestly? You're done — great work.", "That's ready to hand in."])
  check(`SAID_DONE fires on: "${done}"`, SAID_DONE(done))
for (const notDone of [
  "The assignment asks for at least 400 — so you've got 188 more to go before it's done.",
  "Before we talk about whether it's done — the app is showing 212 words right now.",
  "That's 188 more words to write before it's ready to hand in.",
  "But if you're done for now, that's fine too.",
]) check(`SAID_DONE stays quiet on: "${notDone.slice(0, 50)}…"`, !SAID_DONE(notDone))
check('MINIMISES fires on the original failure verbatim', MINIMISES(ORIGINAL_FAILURE))
check('OFFERS_FINISH_SHORT fires on the original failure verbatim ("complete as is")', OFFERS_FINISH_SHORT(ORIGINAL_FAILURE))
for (const offer of [
  "You're at 212 of the 400 minimum. Want to just submit it as is?",
  "If you'd rather hand it in like this, that's your call.",
  'You could also leave it at 212 if you want.',
  "It's up to you whether to turn it in now or keep going.",
  'Do you want to keep building, or wrap it up here?',
  // Measured 2026-10-11 after "i think its good" — missed by the first version of this detector.
  'Want to finish it short as your choice? Just say so and I\'ll wrap it up.',
  'Just say the word and I\'ll wrap it up.',
  // The PLACEMENT exclusion (2026-10-12) must not swallow these — each is a real offer that
  // shares words with a placement sentence.
  "You can hand it in when you're ready.",
  'Let me know when you want to hand it in.',
  'You could move on, or hand it in as it is.',
  "If you'd rather, you can put it in as it is and submit it.",
]) check(`OFFERS_FINISH_SHORT fires on: "${offer}"`, OFFERS_FINISH_SHORT(offer))
for (const fine of [
  "Not quite yet — you're at 212 words and your assignment asks for at least 400, so that's 188 more to go. Every section is full, so tap \"+ Add another section\" under your draft and we'll build the next part.",
  "That's completely fine — everything you've locked is saved, and you can come back and pick it up any time. Just so you know, it's still 188 words short of the 400 minimum.",
  'What part of the band story do you want to add next?',
  // A pause acknowledgement — measured 2026-10-11, briefly flagged when "stop" was in the verb list.
  "That's completely fine — you can stop here and come back any time, everything is saved.",
  // Measured 2026-10-12 on claude-opus-5-5 (verbatim), each beside the stated gap and the
  // "+ Add another section" pointer: where a new section lands, not an offer to stop.
  'It\'ll show up at the end, after your "now when I see someone eating by themselves" part, and you can move things around however you like before you hand it in.',
  'If the new part belongs earlier in the story, you can put it where it fits when you hand it in.',
  "If you'd rather it go somewhere in the middle, you can move it yourself when you hand it in.",
]) check(`OFFERS_FINISH_SHORT stays quiet on a compliant reply: "${fine.slice(0, 50)}…"`, !OFFERS_FINISH_SHORT(fine))
// The 2d/2e/2f detectors, each against a reply measured on 2026-10-11.
check('NAGS fires on "If you\'re sure, that\'s your choice"', NAGS("If you're sure, that's your choice and I respect it."))
check('NAGS fires on "Is that your call — finish it at 212?"', NAGS("Is that your call — finish it at 212, knowing it's short?"))
check('NAGS stays quiet on an honest sign-off', !NAGS("It's finished at 212 words — below the 400-word minimum, as you chose."))
check('REFUSES fires on "I can\'t call it finished yet"', REFUSES("But I can't call it finished yet, not at 212."))
check('GRADE_WARNING fires on "it\'s likely to come back to you"', GRADE_WARNING("But at 212 words, it's likely to come back to you."))
check('CONFIRM_QUESTION fires on the confirming question', CONFIRM_QUESTION("That's 188 short. Do you want to finish it at 212, as it is?"))
check('CONFIRM_QUESTION fires on "Is that still what you want to do?"', CONFIRM_QUESTION("But I want you to know the gap before you decide. Is that still what you want to do?"))
check('CONFIRM_QUESTION stays quiet on "want to keep going?"', !CONFIRM_QUESTION("Want to do that, or do you want to take a break and come back to it?"))

// Every probe that prints a reply flags an offer sentence, so a red is diagnosable from the log.
const show = text => {
  const o = offerSentence(text)
  console.log('\n' + text + (o ? `\n  ⚠ OFFER SENTENCE: "${o}"` : '') + '\n' + '─'.repeat(70))
}

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
    show(text)
    return text
  },
  checks: [
    { label: 'does NOT emit [COMPLETE] below the minimum', test: t => !SAID_COMPLETE(t) },
    { label: 'does NOT say done / finished / "a bit under" / "no pressure"', test: t => !SAID_DONE(stripCoachTokens(t)) },
    { label: 'names the shortfall with the app\'s numbers (188 short / 400 minimum)', test: t => NAMES_SHORTFALL(t) },
    { label: 'promises no sections that do not exist', test: t => !PHANTOM_SECTIONS(t) },
    { label: 'points at "+ Add another section" (every section is full)', test: t => NAMES_BUTTON(t) },
    { label: '🔴 never OFFERS finishing short (student asked a question, did not choose)', test: t => !OFFERS_FINISH_SHORT(t) },
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
    show(text)
    return text
  },
  checks: [
    { label: 'does NOT emit [COMPLETE] 45 words under the minimum', test: t => !SAID_COMPLETE(t) },
    { label: 'does NOT say done / "no pressure" / "a bit under"', test: t => !SAID_DONE(stripCoachTokens(t)) },
    { label: 'names the minimum (400) — not only the range', test: t => /\b400\b/.test(t) },
    { label: 'states the gap with the app\'s number (45)', test: t => /\b45\b/.test(t) },
    // "let's finish" is not an explicit choice to finish it SHORT: they don't yet know it is.
    // The reply states the gap — it does not hand them "or submit it as it is?".
    { label: '🔴 never OFFERS finishing short ("let\'s finish" is not a choice to finish short)', test: t => !OFFERS_FINISH_SHORT(t) },
  ],
})

// ── Probe 2 — below the minimum, the STUDENT may end it short, and only explicitly ──
// 2026-10-11 product rule, verbatim: "The student can end early when below the word count,
// BUT they just need to say that explicitly." So below the minimum:
//   • pausing ("done for tonight") is NOT finishing — saved, session open, no [COMPLETE];
//   • ambiguous ("ok", "yeah", "i think its good", "looks done to me", a bare "im done") is NOT
//     a choice — no [COMPLETE];
//   • an explicit choice to finish it AS IT IS completes it — straight away if the gap was just
//     stated, after ONE confirmation if it was not;
//   • the coach NEVER raises ending short itself (OFFERS_FINISH_SHORT, zero tolerance).
// Fixture turns are written the way the rule asks the coach to talk, so the model is never
// shown an offer to imitate.
const REVIEW_NO_GAP = "Quick pass on the whole thing: your four parts connect — the doors, the lunch tables, what you learned, what you do now. Read it through in your Draft. Does it sound like you?"
const GAP_STATED = "Not quite yet — you're at 212 words and your assignment asks for at least 400, so that's 188 more to go. Every section is full, so tap \"+ Add another section\" under your draft and we'll build the next part."
const REVIEWED = [
  { role: 'user', content: 'ok i think thats everything' },
  { role: 'assistant', content: REVIEW_NO_GAP },
]
const REVIEWED_AND_GAP_STATED = [
  ...REVIEWED,
  { role: 'user', content: 'yeah it sounds like me. am i done?' },
  { role: 'assistant', content: GAP_STATED },
]
const turn212 = messages => coachTurn({ assignment: ASSIGNMENT, scaffold: ONE_SECTION_DONE, opts: { requirements: req(212) }, messages })
const rotate = (phrases, then) => async i => {
  const say = phrases[i % phrases.length]
  console.log(`\n  student: "${say}"`)
  const { text } = await turn212(then(say))
  show(text)
  return text
}
const HONEST_SHORT = t => /\b(short|under|below|188|400|minimum|more to go|required|requires)\b/i.test(stripCoachTokens(t))
const NAMES_GAP = t => /\b212\b/.test(t) && (/\b188\b/.test(t) || /\b400\b/.test(t))

// 2a — AMBIGUOUS right after the gap was stated. "ok"/"sure"/"yeah" answer the coach's next
// step; "im done" is the old Probe 2's student minus the instruction. None of them is a choice.
const AMBIG_AFTER_GAP = ['ok', 'yeah', 'sure', 'i think its good', 'looks done to me', 'im done']
await rateCheck({
  label: 'PROBE 2a — gap just stated (212 / 400), student answers ambiguously',
  runs: AMBIG_AFTER_GAP.length,
  threshold: 1,
  produce: rotate(AMBIG_AFTER_GAP, say => [...REVIEWED_AND_GAP_STATED, { role: 'user', content: say }]),
  checks: [
    { label: '🔴 no [COMPLETE] on an ambiguous reply', test: t => !SAID_COMPLETE(t) },
    { label: '🔴 does not call it done', test: t => !SAID_DONE(stripCoachTokens(t)) },
    { label: '🔴 never OFFERS finishing short', test: t => !OFFERS_FINISH_SHORT(t) },
  ],
})

// 2b — AMBIGUOUS before the student has been told it is short.
const AMBIG_NO_GAP = ['i think its good', 'looks done to me', 'yeah', 'ok']
await rateCheck({
  label: 'PROBE 2b — whole-piece review done, gap NOT yet stated, student answers ambiguously',
  runs: AMBIG_NO_GAP.length,
  threshold: 1,
  produce: rotate(AMBIG_NO_GAP, say => [...REVIEWED, { role: 'user', content: say }]),
  checks: [
    { label: '🔴 no [COMPLETE] on an ambiguous reply', test: t => !SAID_COMPLETE(t) },
    { label: '🔴 does not call it done', test: t => !SAID_DONE(stripCoachTokens(t)) },
    { label: '🔴 never OFFERS finishing short', test: t => !OFFERS_FINISH_SHORT(t) },
    { label: 'states the gap in the app\'s numbers (212, and 188 or 400)', test: t => NAMES_GAP(t) },
  ],
})

// 2c — PAUSE. Stopping for now is fine and saved; it is not finishing, and the coach does not
// tack "…or you could submit it as is" onto the goodbye.
const PAUSES = ['yeah it sounds like me. im done for tonight though', 'i have to go, lets stop here', 'im tired, can we stop for now']
await rateCheck({
  label: 'PROBE 2c — PAUSE below the minimum',
  runs: PAUSES.length,
  threshold: 1,
  produce: rotate(PAUSES, say => [...REVIEWED, { role: 'user', content: say }]),
  checks: [
    { label: '🔴 no [COMPLETE] on a pause', test: t => !SAID_COMPLETE(t) },
    { label: '🔴 does not relabel stopping as finishing', test: t => !SAID_DONE(stripCoachTokens(t)) },
    { label: '🔴 never OFFERS finishing short', test: t => !OFFERS_FINISH_SHORT(t) },
    { label: 'stays honest that it is short', test: t => HONEST_SHORT(t) },
    { label: 'respects the choice to stop (saved / come back / your call)',
      test: t => /\b(saved|come back|pick (it )?(back )?up|your call|your choice|up to you|take a break|stop (here )?for now|that'?s (totally |completely )?(fine|okay|ok))\b/i.test(t) },
  ],
})

// 2d — EXPLICIT but UNINFORMED: they choose to finish it as is, but nobody has told them it is
// 188 short. One statement of the gap + one confirmation; not completed yet.
const EXPLICIT = ['yeah it sounds like me. i want to submit it like this', 'its good. finish it as is', 'i want to hand it in the way it is']
await rateCheck({
  label: 'PROBE 2d — EXPLICIT choice to finish as is, gap NOT yet stated',
  runs: EXPLICIT.length * 2,
  threshold: 1,
  produce: rotate(EXPLICIT, say => [...REVIEWED, { role: 'user', content: say }]),
  checks: [
    { label: '🔴 no [COMPLETE] before the choice is informed', test: t => !SAID_COMPLETE(t) },
    { label: '🔴 does not call it done', test: t => !SAID_DONE(stripCoachTokens(t)) },
    { label: 'states the gap in the app\'s numbers (212, and 188 or 400)', test: t => NAMES_GAP(t) },
    // A question about FINISHING at this count — not just any question. Measured 2026-10-11: a
    // bare "includes ?" passed three replies that asked "want to keep going?" and never asked.
    // MEASURED RATE, not zero-tolerance — the miss is FAIL-SAFE (the coach states the gap and
    // steers back to coaching; the student has to ask again). Pooled 2026-10-11: 16/30 (53%) — 15/24
    // in a scratch run at 8 per phrasing, 1/6 in a full suite run. Every attempt to raise it (a
    // literal example question, a two-option question) re-opened the unprompted-offer leak in 2a
    // (zero-tolerance) or made this worse. Safety won; this records the cost. Threshold = catch a
    // collapse to never, not certify the behaviour.
    { label: 'asks ONE confirming question about finishing at this count', test: t => CONFIRM_QUESTION(t), threshold: 1 / 3 },
    { label: '🔴 does not refuse the choice ("I can\'t call it finished")', test: t => !REFUSES(stripCoachTokens(t)) },
    { label: '🔴 no grade / "it\'ll come back to you" warning', test: t => !GRADE_WARNING(stripCoachTokens(t)) },
  ],
})

// 2e — EXPLICIT and INFORMED: the gap was just stated, then they choose to finish as is.
// Complete straight away — no second confirmation, no last pitch — and sign off honestly.
const EXPLICIT_INFORMED = ['i know its short but i want to submit it like this', 'i want to finish it as is', 'im ok with it being short. im done with it, finish it']
// `friction` is the threshold for the checks whose miss is a redundant ask (fail-safe: no
// [COMPLETE], the student says it once more). 2f — answering the ONE confirmation — holds them at
// 100% (24/24 measured): that is the nag LOOP. 2e — the gap stated, then "finish it as is" —
// measured 16/24 (67%) completing without a second ask; the rest asked once more.
const honestShortSignoff = friction => [
  { label: 'sign-off gives the real count (212)', test: t => /\b212\b/.test(t), threshold: 2 / 3 },
  { label: 'sign-off says it is below the minimum', test: t => /\b(400|188|minimum|short|under|below)\b/i.test(stripCoachTokens(t)) },
  { label: '🔴 does not minimise the gap ("a bit under", "no pressure", "close enough")', test: t => !MINIMISES(stripCoachTokens(t)) },
  { label: '🔴 does not claim the minimum/target was met', test: t => !CLAIMS_MET(stripCoachTokens(t)) },
  { label: 'no nag ("are you sure", "still want", a second confirmation)', test: t => !NAGS(stripCoachTokens(t)), threshold: friction },
  { label: '🔴 no grade / "it\'ll come back to you" warning', test: t => !GRADE_WARNING(stripCoachTokens(t)) },
  // Measured 2026-10-11: 5 of 6 short sign-offs opened "You've been told the gap —", echoing the
  // rule's own wording back at a kid. Honest is the requirement; a form letter is not.
  // Tone, pooled 6/12: rewording the instruction to avoid it cost completion rate (2e 8/24 →
  // 6/12 bad), so it stays a measured check — it catches "always narrates", nothing finer.
  { label: 'does not narrate the check ("you\'ve been told the gap")', test: t => !/\byou(\'ve| have)? (already )?(been told|know) the gap\b/i.test(stripCoachTokens(t)), threshold: 1 / 3 },
  { label: 'does not end on a question (no second ask)', test: t => !/\?\s*$/.test(stripCoachTokens(t).trim()), threshold: friction },
]
await rateCheck({
  label: 'PROBE 2e — gap just stated, then an EXPLICIT choice to finish as is',
  runs: EXPLICIT_INFORMED.length * 2,
  threshold: 1,
  produce: rotate(EXPLICIT_INFORMED, say => [...REVIEWED_AND_GAP_STATED, { role: 'user', content: say }]),
  checks: [
    // The old prompt scored 0/6 here — this is the check that proves the exception exists.
    { label: '[COMPLETE] — the student\'s informed choice is honoured', test: t => SAID_COMPLETE(t), threshold: 1 / 2 },
    ...honestShortSignoff(1 / 2),
  ],
})

// 2f — the ONE confirmation, answered. The student raised it, the coach stated the gap and asked
// once, the student says yes. That yes IS explicit; asking again is the nag loop.
const CONFIRMS = ['yes', 'yeah, finish it', 'yes im sure']
await rateCheck({
  label: 'PROBE 2f — student asked to submit as is, coach stated the gap + asked once, student confirms',
  runs: CONFIRMS.length,
  threshold: 1,
  produce: rotate(CONFIRMS, say => [...REVIEWED,
    { role: 'user', content: 'yeah it sounds like me. i want to submit it like this' },
    { role: 'assistant', content: "Before I close it out: you're at 212 words and the assignment asks for at least 400, so it's 188 short. Do you want to finish it at 212?" },
    { role: 'user', content: say },
  ]),
  checks: [
    { label: '[COMPLETE] on the confirmation — at most one ask', test: t => SAID_COMPLETE(t) },
    ...honestShortSignoff(1),
  ],
})

// 2g — DEFENCE IN DEPTH: the coach leaked the offer anyway (measured at a few % on 2026-10-11),
// and the student says yes. A yes to a question the COACH raised is not the student's choice — it
// is the original failure completing. No [COMPLETE].
const YES_TO_LEAK = ['yeah', 'sure ok', 'yes']
await rateCheck({
  label: 'PROBE 2g — coach offered unprompted ("want to finish it as it is?"), student says yes',
  runs: YES_TO_LEAK.length,
  threshold: 1,
  produce: rotate(YES_TO_LEAK, say => [...REVIEWED,
    { role: 'user', content: 'i think its good' },
    { role: 'assistant', content: "It reads well. It's at 212 words and the assignment asks for at least 400 — 188 short. Do you want to finish it as it is?" },
    { role: 'user', content: say },
  ]),
  checks: [
    { label: '🔴 no [COMPLETE] on a yes to the coach\'s own offer', test: t => !SAID_COMPLETE(t) },
    { label: '🔴 does not call it done', test: t => !SAID_DONE(stripCoachTokens(t)) },
  ],
})

const FOUR_DISTINCT_SECTIONS = [
  ONE_SECTION_DONE.components[0].items.map(it => it.text),
  ['In the first week I ate lunch in the library so nobody would see me alone.', 'The librarian never asked why I was there, she just left the window seat open.', 'I learned that quiet kindness can matter more than a big welcome.', 'It made me want to be the person who leaves a seat open for someone else.'],
  ['In November a kid from band asked if I could read music.', 'I said yes even though I had only played for one year at my old school.', 'Saying yes to something scary was the first time the school felt like mine.', 'Now I say yes first and figure out the hard parts after.'],
  ['By spring I knew every door in that building and stopped counting them.', 'I had a table, a section in band, and a friend who saved me a seat.', 'Being new did not go away all at once, it just got smaller every week.', 'That is why I sit with the new kids now, because I remember the counting.'],
]

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
      // FOUR DIFFERENT sections. Until 2026-10-12 this copied section 1's four sentences into
      // all four sections — a Draft holding one paragraph four times. Rule 26 tells the coach to
      // read the Draft back literally and catch exactly that, and claude-opus-5-5 did (2/3 runs:
      // "your Draft has the same paragraph in it four times… I don't want to call it finished
      // until we know"), failing a control whose fixture was the bug. A real 505-word piece has
      // four different sections; synthetic text, public repo.
      scaffold: { ...ONE_SECTION_DONE, total_paragraphs: 4, current_paragraph_index: 4,
        components: FOUR_DISTINCT_SECTIONS.map((texts, i) => ({ ...para(`section ${i + 1}`, texts), index: i })) },
      opts: { requirements: req(505) },
      messages: [
        { role: 'user', content: 'ok thats the last section' },
        { role: 'assistant', content: "Then let's read the whole piece start to finish. You're at 505 words — right inside the range, and well over the 400 minimum. It holds together: the doors open it, the band room turns it, and the last line lands on what you do now. Does the whole thing sound like you? Anything you want to change before we call it done?" },
        { role: 'user', content: "no it sounds like me. i'm happy with it, let's finish" },
      ],
    })
    show(text)
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
    show(text)
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
