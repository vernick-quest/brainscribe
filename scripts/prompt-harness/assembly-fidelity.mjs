// Assembly fidelity — does pressing Assemble give the student back their own writing?
//
// Sierra, on her 1,227-word section: "When I clicked Assemble Paragraph it completely
// changed my writing." Her coach truthfully said it hadn't touched it — a DIFFERENT model
// call did, one the coach cannot see. Rule 6 forbids the coach from joining a student's
// ideas with a supplied connective; ASSEMBLE_SYSTEM told the assembler to "smooth
// transitions between components". Two prompts in one product, contradicting each other.
//
// MEASURED BEFORE CHANGING ANYTHING, on this fixture, against the SHIPPED prompt:
//     ellipses    1 -> 0   (-1)     the ellipsis was dropped
//     lineBreaks 16 -> 0   (-16)    every paragraph break destroyed
//     dashes/sentence-ends/quotes    unchanged
//     shingle survival 92.3%
// Two runs, identical both times. On her real section the same prompt went the OTHER way
// (+29 breaks) because "a single flowing paragraph" is an absurd instruction for 1,227
// words, so the model overrode it. Collapse and explosion are the same defect: nothing in
// the prompt protected paragraph structure.
//
// So these assertions PROTECT what already survives (punctuation, sentence boundaries) and
// FIX what did not (structure, ellipses). A regression moves these numbers.
//
// Haiku, 3 calls, well under a cent.

import { callModel, check, report } from './lib/harness.mjs'
import { assembleSystemFor, buildAssembleUserMessage, isVerbatimType } from '../../lib/assemblePrompt.js'
import { FIXTURE_COMPONENTS, FIXTURE_TEXT, fidelityMetrics, diffMetrics, shingleSurvival } from './lib/fidelity.mjs'

const MODEL = 'claude-haiku-4-5-20251001'

async function assemble(paragraphType) {
  const { userMessage } = buildAssembleUserMessage({ components: FIXTURE_COMPONENTS, paragraphType })
  const { text } = await callModel({ model: MODEL, system: assembleSystemFor(paragraphType), user: userMessage })
  return text.trim()
}

function reportDiff(label, before, after) {
  const d = diffMetrics(before, after)
  console.log(`  ${label}:`)
  for (const [k, v] of Object.entries(d)) {
    console.log(`     ${k.padEnd(13)} ${String(v.before).padStart(4)} -> ${String(v.after).padStart(4)}  (${v.delta >= 0 ? '+' : ''}${v.delta})`)
  }
  return d
}

// ── PROBE 1 — a STORY must come back verbatim ───────────────────────────────────────
// This is Sierra's case. Narrative gets zero smoothing: every authorial choice survives.
console.log('PROBE 1 — narrative section (Sierra\'s shape): join, do not edit')
const narrative = await assemble('narrative')
console.log('\n' + narrative + '\n')
const dN = reportDiff('narrative', FIXTURE_TEXT, narrative)
const sN = shingleSurvival(FIXTURE_TEXT, narrative)
console.log(`     shingle survival ${sN.kept}/${sN.total} = ${(sN.fraction * 100).toFixed(1)}%\n`)

check('P1: paragraph structure is preserved exactly (baseline destroyed all 16)',
  dN.lineBreaks.delta === 0, `${dN.lineBreaks.before} -> ${dN.lineBreaks.after}`)
check('P1: the ellipsis survives (baseline dropped it)',
  dN.ellipses.delta === 0, `${dN.ellipses.before} -> ${dN.ellipses.after}`)
check('P1: dashes survive', dN.dashes.delta === 0, `${dN.dashes.before} -> ${dN.dashes.after}`)
check('P1: sentence boundaries unchanged — nothing merged or split',
  dN.sentenceEnds.delta === 0, `${dN.sentenceEnds.before} -> ${dN.sentenceEnds.after}`)
check('P1: quotation marks survive — dialogue intact',
  dN.quoteMarks.delta === 0, `${dN.quoteMarks.before} -> ${dN.quoteMarks.after}`)
// Verbatim means verbatim. The baseline managed 92.3% WITH licence to smooth; with none,
// anything short of near-total survival means it is still rewriting.
check('P1: ≥99% of the student\'s phrasing survives byte-for-byte',
  sN.fraction >= 0.99, `${(sN.fraction * 100).toFixed(1)}%`)
check('P1: the deliberate misspelling in dialogue is left alone ("untill")',
  narrative.includes('untill'))
check('P1: the deliberate lowercase sentence opening is left alone ("his mother used to say")',
  /\bhis mother used to say\b/.test(narrative))
check('P1: no component labels leaked into the prose',
  !/^\s*(hook|context|body|closing)\s*:/im.test(narrative))

// ── PROBE 2 — PROSE may smooth seams, but still may not re-paragraph ────────────────
// An essay body legitimately gets its components joined into one paragraph. What it must
// NOT do is invent or destroy structure inside the student's own text.
console.log('PROBE 2 — essay body: seam smoothing allowed, restructuring is not')
const body = await assemble('body')
console.log('\n' + body + '\n')
const dB = reportDiff('body', FIXTURE_TEXT, body)
const sB = shingleSurvival(FIXTURE_TEXT, body)
console.log(`     shingle survival ${sB.kept}/${sB.total} = ${(sB.fraction * 100).toFixed(1)}%\n`)

check('P2: still keeps the ellipsis', dB.ellipses.delta === 0, `${dB.ellipses.before} -> ${dB.ellipses.after}`)
check('P2: does not merge or split sentences', dB.sentenceEnds.delta === 0,
  `${dB.sentenceEnds.before} -> ${dB.sentenceEnds.after}`)
check('P2: keeps dialogue quotation marks', dB.quoteMarks.delta === 0,
  `${dB.quoteMarks.before} -> ${dB.quoteMarks.after}`)
// Prose has licence to touch the SEAMS, so the floor is lower than the story's — but the
// shipped baseline was 92.3% and that included eating the structure.
check('P2: ≥93% of the student\'s phrasing survives', sB.fraction >= 0.93,
  `${(sB.fraction * 100).toFixed(1)}%`)
// The prose pass's JOB is to produce ONE paragraph, so collapsing breaks is correct here
// and preserving them is not something it can honestly promise (an earlier version of the
// rule claimed both and the model collapsed everything anyway — 0 of 10). What must never
// happen is the Sierra direction: structure the student did NOT write being invented.
// This fixture is a story pushed through the prose path on purpose — the exact mismatch
// that hit her before narrative got its own prompt — so it is the strictest case available.
check('P2: never INVENTS a paragraph break (Sierra saw +29)',
  fidelityMetrics(body).lineBreaks <= fidelityMetrics(FIXTURE_TEXT).lineBreaks,
  `${fidelityMetrics(FIXTURE_TEXT).lineBreaks} -> ${fidelityMetrics(body).lineBreaks}`)

// ── PROBE 3 — the routing itself, free and deterministic ───────────────────────────
console.log('PROBE 3 — type routing')
check('P3: narrative / custom / personal_statement route to the verbatim prompt',
  ['narrative', 'custom', 'personal_statement'].every(isVerbatimType))
check('P3: essay types do not', !['body', 'introduction', 'conclusion', undefined, null].some(isVerbatimType))
// Each prompt carries the rule its own purpose allows. The story pass preserves structure
// absolutely; the prose pass produces one paragraph and so can only promise never to INVENT
// one. Asserting a single shared sentence across both was the stale version of this check.
check('P3: the story prompt forbids adding, removing OR moving a break',
  /NEVER add, remove, or move a paragraph break ANYWHERE/.test(assembleSystemFor('narrative')))
check('P3: the prose prompt forbids INSERTING a break',
  /NEVER insert a paragraph break/.test(assembleSystemFor('body')))
check('P3: neither prompt still carries the unbounded "smooth transitions" licence',
  !['narrative', 'body'].some(t => /smooth transitions between components/.test(assembleSystemFor(t))))

process.exit(report('Assembly fidelity — the student gets their own writing back') === 0 ? 0 : 1)
