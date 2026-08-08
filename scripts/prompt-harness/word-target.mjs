// Rule 14a — does the coach actually coach toward the RECOMMENDED RANGE?
//
// Two things can go wrong and neither shows up in a build:
//   1. the rule is in the prompt and the model ignores it (a target is given and
//      the coach only ever says "under 500");
//   2. the model invents a target when it is given none — the failure that would
//      have a coach making up a word count for an assignment that states no limit.
// Probe both. ~$0.02 for the pair.

import { coachTurn, check, report } from './lib/harness.mjs'
import { recommendedForTarget } from '../../lib/wordCountTargets.js'

const ASSIGNMENT = `Personal narrative: write about a time you faced a challenge and what it taught you.
Maximum 500 words. Due Friday.`

const target = { type: 'words', max: 500, label: 'up to 500 words' }
const rec = recommendedForTarget(target, { assignmentType: 'default' })
console.log(`\nRecommended range from lib/wordCountTargets.js: ${rec.low}–${rec.high} (max 500)\n`)

// ── Probe 1: the student asks outright ───────────────────────────────────────
// The sharpest test of the rule: asked "how long?", does the coach answer with the
// RANGE, or fall back to the ceiling ("anything under 500")? Rule 14a's other two
// moments (scaffold intro, final sign-off) are further into a session; this one is
// a single turn and tests the same decision.
console.log('PROBE 1 — student asks how long it needs to be')
const { text: withTarget } = await coachTurn({
  assignment: ASSIGNMENT,
  opts: { requirements: { targets: [target], actual: { words: 0 } } },
  messages: [
    { role: 'user', content: "hi, i need to write this narrative" },
    { role: 'assistant', content: "Okay — good place to start. Do you have a challenge in mind already, or are you still figuring out what to write about?" },
    { role: 'user', content: "yeah, the time i broke my wrist before the season started. how long does this have to be?" },
  ],
})
console.log('\n' + withTarget + '\n' + '─'.repeat(70))

const saysLow = withTarget.includes(String(rec.low))
const saysHigh = withTarget.includes(String(rec.high))
// "85%", "85 percent", "80-90%" — any of these leaks the arithmetic to a student.
const saysPercent = /\d\s?%|\bpercent\b/i.test(withTarget)
// A number in the low hundreds that is NOT one of ours and not the ceiling would
// mean it computed its own target.
const inventedTarget = (withTarget.match(/\b([1-9]\d{2})\b/g) ?? [])
  .filter(n => ![String(rec.low), String(rec.high), '500'].includes(n))

check('states the recommended range in words', saysLow && saysHigh,
  `${saysLow ? rec.low : `missing ${rec.low}`} / ${saysHigh ? rec.high : `missing ${rec.high}`}`)
check('never says a percentage', !saysPercent)
check('invents no other target number', inventedTarget.length === 0,
  inventedTarget.length ? `saw ${inventedTarget.join(', ')}` : '')
check('does not frame the range as a requirement',
  !/\b(must|have to|need to) (write|reach|hit|get to)\b/i.test(withTarget))

// ── Probe 2: NO target provided — silence is the correct behavior ────────────
console.log('\nPROBE 2 — assignment states no limit at all')
const { text: noTarget } = await coachTurn({
  assignment: 'Personal narrative: write about a time you faced a challenge and what it taught you. Due Friday.',
  opts: {},
  messages: [{ role: 'user', content: "hi, i need to write this narrative" }],
})
console.log('\n' + noTarget + '\n' + '─'.repeat(70))

const inventedLength = /\b\d{2,4}\s*(?:to|–|-|and)\s*\d{2,4}\s*words\b|\baim for (?:about |around )?\d{2,4}\s*words\b/i.test(noTarget)
check('invents no word target when none is stated', !inventedLength)

process.exit(report('Rule 14a — recommended target range') === 0 ? 0 : 1)
