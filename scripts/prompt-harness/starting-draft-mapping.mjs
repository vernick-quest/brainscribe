// STARTING DRAFT → SCAFFOLD MAPPING — where do KEPT draft paragraphs actually land?
//
// ⚠️ EXPECTED RED on the prompt as of 2026-10-11. This is a REPRO probe for an open bug, not
// a gate: it is deliberately NOT in `npm run test:prompts` until a fix makes it pass. Add it
// there in the same commit as the fix, with thresholds re-set from the post-fix measurement.
//
// ── The bug (simulated eval 2026-10-11, 3/3 sessions) ──────────────────────────────────────
// A personal_statement section has FOUR fixed parts (hook/context/reflection/connection —
// getParaItems in components/TutorSession.js). The starting-draft block in lib/prompts.js
// (items 4 and 5c) says the sections ARE the draft's paragraphs, and that each component takes
// "a run of their sentences". The coach read that as one PARAGRAPH per PART: it locked whole
// draft paragraphs into section 1's parts, never emitted [PARA_DONE], and re-locked them on
// later turns — one session ended at 740 words with a 168-word paragraph in it twice.
//
// ── What a CORRECT coach does here, under the current token contract ───────────────────────
// Fresh 5-section scaffold, cursor on section 1, review pass (Rule 17) already run on the
// first two paragraphs, student says "yes lock them both in":
//   · every [DONE:] payload is verbatim draft text (Rule 5b / item 5c)
//   · ¶1 goes into section 1 — split across its parts or not — and section 1 is then complete
//     ([PARA_DONE:0], or every part confirmed so the client's Net A completes it)
//   · ¶2 NEVER lands in section 1. It goes into section 2 after the cursor advances, this turn
//     or next (Rule 25 allows "¶2 goes in next")
//   · no draft sentence is ever locked into two places, including on a later re-lock turn
// None of those assertions name a fix. Option (a) one-part-per-paragraph scaffolds, (b) a keep
// that emits [DONE]+[PARA_DONE] together, and (c) a client net refusing a [DONE] already
// confirmed elsewhere can each be measured against them.
//
// ── MEASURED on the current prompt, 2026-10-11 (claude-sonnet-4-6) ────────────────────────
// Turn 1, 8/8 samples: the coach put ¶1 WHOLE into section 1's `hook` and ¶2 WHOLE into
// section 1's `context`, then [PARA_DONE:0] ("first paragraph is your hook, second is the
// context"). Payloads were verbatim 8/8 and [PARA_DONE] fired 8/8 — the failure is the
// PARAGRAPH→PART mapping, not a missing token. Re-emitted [SCAFFOLD] 2/8 (ignored by client).
// Turn 2, neutral ask ("put the second one in too if it isn't already"): no re-lock, 0/4 dup.
// Turn 2, the student reporting what the panel shows ("section 2 is empty"): the coach
// re-locked ¶2 into section 2 while it still sat in section 1 — DUPLICATED 4/4.
//
// ── How a turn is applied ───────────────────────────────────────────────────────────────────
// Tokens are applied to the scaffold by `applyTurn` below, which MIRRORS the [DONE:] /
// [PARA_DONE:] / Net-A handlers in TutorSession.js parseAndApplyScaffoldTokens, built on the
// SAME pure functions from lib/scaffoldWrite.js — so "where the words landed" is where the
// live client would put them, not where the coach said it put them. It is a COPY of the
// handler glue (TutorSession.js contains JSX and cannot be imported here); if that handler
// changes, this mirror must change with it or the probe tests a client that does not ship.
//
// ── Cost ────────────────────────────────────────────────────────────────────────────────────
// RUNS sequences × 2 coach turns. Usage is tallied from the API's own `usage` field and the
// run ABORTS before any call that would start past PROBE_BUDGET_USD (default $1.00).
//   node scripts/prompt-harness/starting-draft-mapping.mjs                 # RUNS=4
//   node scripts/prompt-harness/starting-draft-mapping.mjs --control-only  # $0, no API
//
// Fixture is SYNTHETIC (public repo — never real student writing here).

import { coachTurn, check, rateCheck, report } from './lib/harness.mjs'
import { stripCoachTokens } from '../../lib/coachTokens.js'
import {
  resolveWriteIndex, resolveComponentWrite, updateComponentItem,
  shouldPreserveExisting, preserveExistingItem, resolveDoneText,
} from '../../lib/scaffoldWrite.js'

const RUNS = Number(process.env.RUNS ?? 4)
const BUDGET = Number(process.env.PROBE_BUDGET_USD ?? 1.0)
const CONTROL_ONLY = process.argv.includes('--control-only')

// ── Spend meter — reads the API's usage, never estimates ─────────────────────────────────────
// claude-sonnet-4-6 list price: $3/M input, $15/M output; cache write 1.25×, cache read 0.1×.
const PRICE = { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.3 }
let spent = 0, calls = 0
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  const res = await realFetch(url, init)
  if (String(url).includes('api.anthropic.com')) {
    const u = (await res.clone().json().catch(() => ({}))).usage ?? {}
    calls++
    spent += ((u.input_tokens ?? 0) * PRICE.in + (u.output_tokens ?? 0) * PRICE.out +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) / 1e6
  }
  return res
}
function budgetGuard() {
  if (spent >= BUDGET) {
    console.error(`\n🔴 BUDGET: $${spent.toFixed(4)} spent of $${BUDGET.toFixed(2)} after ${calls} calls — stopping before the next call.`)
    process.exit(3)
  }
}

// ── Fixture ──────────────────────────────────────────────────────────────────────────────────
const ASSIGNMENT = `Personal statement: describe a challenge you faced and how it changed you.
400–550 words. Due Monday.`
const REQUIREMENTS = { targets: [{ type: 'words', min: 400, max: 550 }], actual: { words: 0, paragraphs: 0 } }

const PARAS = [
  `The chain came off my bike on the steepest part of Alder Hill, and I stood there with grease on both hands. Cars kept passing me. I did not know how to put it back on, and I was too embarrassed to wave anyone down. I walked the bike home, all two miles of it.`,
  `My neighbor Mrs. Delgado was watering her tomatoes when I came up the driveway. She looked at the chain hanging loose and said, "That's a five-minute fix if you know where to look." Then she went inside and came back with a rag and a flathead screwdriver. She did not fix it for me. She made me do every step while she pointed.`,
  `After that I started noticing everything that was broken in our garage. The lawnmower that would not start. The squeaky hinge on the side door. A radio that only played static. I asked Mrs. Delgado about each one, and she always answered with a question instead of an answer.`,
  `By spring I had fixed the hinge and the radio, but the lawnmower beat me three times. The third time I almost gave up and asked my dad to take it to the shop. Instead I read the manual cover to cover and found a clogged fuel line. When it finally started, the noise was the best sound I had ever heard.`,
  `I still get grease on my hands. Now I do not wipe it off right away.`,
]
const DRAFT = PARAS.join('\n\n')
const WORDS = DRAFT.trim().split(/\s+/).length
const START = { state: 'present', content: DRAFT, wordCount: WORDS, source: 'pasted' }

const PS_ITEMS = ['hook', 'context', 'reflection', 'connection']
const freshScaffold = () => ({
  assignment_type: 'personal_statement',
  total_paragraphs: PARAS.length,
  current_paragraph_index: 0,
  thesis: null,
  components: PARAS.map((_, i) => ({
    index: i, type: 'personal_statement', status: i === 0 ? 'working' : 'locked', summary: null,
    items: PS_ITEMS.map((id, j) => ({ id, label: id, status: i === 0 && j === 0 ? 'working' : 'locked', text: null, nuggetText: null })),
  })),
})

const HISTORY_A = [
  { role: 'user', content: 'hi' },
  { role: 'assistant', content: "You've already got a real story here — the chain coming off on Alder Hill, Mrs. Delgado making you do every step yourself, the lawnmower that beat you three times. I've set it up as five sections, one for each paragraph you wrote. Let's start at the top: your first two paragraphs are walking the bike home and Mrs. Delgado's five-minute fix. Do you want to keep those as they are, or work on them?" },
  { role: 'user', content: 'keep the first two paragraphs exactly how i wrote them, i like them' },
  // Rule 17's named review pass, over BOTH paragraphs, so a lock is earned on the next turn —
  // this probe tests WHERE the words go, not whether the coach is willing to lock.
  { role: 'assistant', content: "Quick pass before we lock them in. In the first one, \"Cars kept passing me.\" is a short sentence right after a long one, and that's why it hits — I'd leave it. In the second, \"She did not fix it for me.\" carries the whole point of the paragraph. I checked sentence starters and length in both and they read clean. Want me to lock those two paragraphs in exactly as you wrote them?" },
  { role: 'user', content: 'yes lock them both in' },
]
// Turn 2 is what the student would say LOOKING AT THEIR DRAFT PANEL after turn 1. If ¶2 went
// where it belongs, section 2 shows it and they just ask for it to be in. If section 2 is still
// empty — the bug — they say so, exactly as all three eval students did ("its all stuck in
// section 1 and the other ones are empty"). That complaint is what provoked the eval's
// duplicate re-locks, so it is the re-lock trigger this turn measures. A fixed coach never sees
// the complaint, because its section 2 is not empty.
const studentB = scAfterA => {
  const s2 = scAfterA.components[1]?.items ?? []
  return s2.some(it => it.status === 'confirmed' && norm(it.text))
    ? "ok cool. put the second paragraph in too if it isn't already, exactly how i wrote it"
    : 'wait the draft panel has both my paragraphs stuck in section 1 and section 2 is empty. can you put my second paragraph in section 2 where it goes? exactly how i wrote it'
}

// ── Text helpers ─────────────────────────────────────────────────────────────────────────────
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim()
// "Mrs. Delgado" must not end a sentence — a splitter that breaks there makes every count wrong
// while still re-joining to the paragraph, so the control below pins the expected counts.
const SENTENCES = PARAS.map(p => norm(p).split(/(?<=[.!?]["”]?)(?<!\b(?:Mrs|Mr|Ms|Dr)\.)\s+(?=[A-Z"“])/).map(norm).filter(Boolean))
const nWords = s => norm(s).toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean)
const shingles = s => { const w = nWords(s), o = new Set(); for (let i = 0; i + 6 <= w.length; i++) o.add(w.slice(i, i + 6).join(' ')); return o }
/** Near-duplicate: ≥50% of the SMALLER text's 6-word shingles appear in the other. */
export function nearDup(a, b) {
  const A = shingles(a), B = shingles(b)
  if (!A.size || !B.size) return norm(a).length > 0 && norm(a).toLowerCase() === norm(b).toLowerCase()
  const [S, L] = A.size <= B.size ? [A, B] : [B, A]
  let k = 0; for (const s of S) if (L.has(s)) k++
  return k / S.size >= 0.5
}
/** Which draft sentences [¶k, j] a text contains, whole. */
const sentencesIn = text => {
  const t = norm(text), out = []
  SENTENCES.forEach((ss, k) => ss.forEach((s, j) => { if (t.includes(s)) out.push([k, j]) }))
  return out
}
const isVerbatim = text => norm(text).length > 0 && norm(DRAFT).includes(norm(text))

// ── Mirror of TutorSession.js parseAndApplyScaffoldTokens: [DONE:], [PARA_DONE:], Net A ──────
// Same pure functions, same order. `assembledIndexes` = sections completed before this turn
// (each [PARA_DONE] saves a paragraphs row in the live client).
export function applyTurn(scaffold, raw) {
  let sc = JSON.parse(JSON.stringify(scaffold))
  const assembledIndexes = sc.components.map((p, i) => (p.status === 'complete' ? i : -1)).filter(i => i >= 0)
  const emissions = []
  const tokenRE = /\[(SCAFFOLD|ACTIVE|NUGGET|DONE|THESIS|PARA_DONE):([^\]]*)\]/g
  let m
  while ((m = tokenRE.exec(raw)) !== null) {
    const [, type, payload] = m
    if (type === 'DONE') {
      const c = payload.indexOf(':')
      const componentId = c === -1 ? payload : payload.slice(0, c)
      const inlineText = c === -1 ? '' : payload.slice(c + 1).trim()
      const paraIdx = resolveWriteIndex(sc)
      const target = resolveComponentWrite(sc, paraIdx, componentId, { assembledIndexes })
      emissions.push({ componentId, text: inlineText, cursor: paraIdx, landed: target ? `${target.paraIdx}.${target.id}` : 'REFUSED' })
      if (target) sc = updateComponentItem(sc, target.paraIdx, target.id, item => {
        if (shouldPreserveExisting(target, item)) return preserveExistingItem(item, target)
        if (item.status === 'confirmed' && item.text && inlineText && item.text.length > inlineText.length
            && item.text.toLowerCase().includes(inlineText.trim().toLowerCase())) return item
        const { text, dropped } = resolveDoneText(item, inlineText)
        if (dropped) return { ...item, writeDropped: true }
        return { ...item, status: 'confirmed', text, writeDropped: false }
      })
    } else if (type === 'PARA_DONE') {
      const c = payload.indexOf(':')
      if (c === -1) continue
      const emittedIdx = parseInt(payload.slice(0, c))
      if (isNaN(emittedIdx)) continue
      const cur = sc.current_paragraph_index ?? 0
      const targetIdx = emittedIdx > cur ? cur : emittedIdx
      if (targetIdx >= 0 && targetIdx < sc.components.length) {
        sc = {
          ...sc,
          current_paragraph_index: Math.min(Math.max(cur, targetIdx + 1), sc.components.length),
          components: sc.components.map((p, i) => (i === targetIdx ? { ...p, status: 'complete' } : p)),
        }
      }
    }
  }
  // Net A — every component confirmed but no [PARA_DONE] → complete + advance.
  if (sc.components.length > 1) {
    let advanceTo = sc.current_paragraph_index ?? 0
    sc = {
      ...sc,
      components: sc.components.map((p, i) => {
        const all = (p.items ?? []).length > 0 && p.items.every(it => it.status === 'confirmed')
        if (all && p.status !== 'complete') { if (i + 1 > advanceTo) advanceTo = i + 1; return { ...p, status: 'complete', netA: true } }
        return p
      }),
    }
    sc.current_paragraph_index = Math.min(advanceTo, sc.components.length)
  }
  return { scaffold: sc, emissions, rescaffold: /\[SCAFFOLD:/.test(raw) }
}

// ── What landed where ────────────────────────────────────────────────────────────────────────
export function analyse(sc, emissions) {
  const parts = []
  sc.components.forEach(p => (p.items ?? []).forEach(it => {
    if (it.status === 'confirmed' && norm(it.text)) parts.push({ sec: p.index, id: it.id, text: it.text, sents: sentencesIn(it.text) })
  }))
  // Duplicates in STATE: a sentence in two parts, or two parts that near-duplicate each other
  // (the second catches a paraphrased re-lock that no longer contains any sentence whole).
  const where = new Map()
  for (const p of parts) for (const [k, j] of p.sents) {
    const key = `${k}:${j}`; where.set(key, [...(where.get(key) ?? []), `s${p.sec + 1}.${p.id}`])
  }
  const dupState = [...where.entries()].filter(([, w]) => w.length > 1).map(([s, w]) => `¶${+s.split(':')[0] + 1}#${+s.split(':')[1] + 1} in ${w.join(' & ')}`)
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    if (nearDup(parts[i].text, parts[j].text)) dupState.push(`near-dup s${parts[i].sec + 1}.${parts[i].id} ~ s${parts[j].sec + 1}.${parts[j].id}`)
  }
  // Duplicates in what the COACH EMITTED: one sentence aimed at two different landing spots
  // across the session. Catches a re-lock the client's preserve-guard happened to absorb.
  const emitWhere = new Map()
  for (const e of emissions) for (const [k, j] of sentencesIn(e.text)) {
    const key = `${k}:${j}`; emitWhere.set(key, new Set([...(emitWhere.get(key) ?? []), e.landed === 'REFUSED' ? 'REFUSED' : `s${+e.landed.split('.')[0] + 1}.${e.landed.split('.')[1]}`]))
  }
  const dupEmit = [...emitWhere.entries()].filter(([, w]) => w.size > 1).map(([s, w]) => `¶${+s.split(':')[0] + 1}#${+s.split(':')[1] + 1} → ${[...w].join(' & ')}`)
  const parasInSection = sc.components.map(p => new Set(parts.filter(x => x.sec === p.index).flatMap(x => x.sents.map(([k]) => k))))
  const mixedSections = parasInSection.map((s, i) => (s.size > 1 ? `section ${i + 1} holds ¶${[...s].map(k => k + 1).join('+¶')}` : null)).filter(Boolean)
  const fullyIn = (k, sec) => SENTENCES[k].every((_, j) => parts.some(p => p.sec === sec && p.sents.some(([a, b]) => a === k && b === j)))
  const anywhere = k => [...new Set(parts.filter(p => p.sents.some(([a]) => a === k)).map(p => p.sec))]
  const crammed = parts.filter(p => SENTENCES.some((ss, k) => ss.length > 1 && ss.every((_, j) => p.sents.some(([a, b]) => a === k && b === j))))
    .map(p => `${p.sec + 1}.${p.id}`)
  return {
    parts, dupState, dupEmit, mixedSections, fullyIn, anywhere, crammed,
    nonVerbatim: emissions.filter(e => !isVerbatim(e.text)),
    cursor: sc.current_paragraph_index,
    complete: i => sc.components[i]?.status === 'complete',
  }
}

const summarise = (label, sc, a, emissions) => {
  console.log(`  ${label}: ${emissions.map(e => `[DONE:${e.componentId}](${e.text.split(/\s+/).length}w → ${e.landed === 'REFUSED' ? 'REFUSED' : 's' + (+e.landed.split('.')[0] + 1) + '.' + e.landed.split('.')[1]})`).join(' ') || 'no [DONE]'}`)
  console.log(`    sections: ${sc.components.map((p, i) => `s${i + 1}:${p.items.filter(it => it.status === 'confirmed').length}/4${p.status === 'complete' ? (p.netA ? '✓(netA)' : '✓') : ''}`).join(' ')}  cursor→s${a.cursor + 1}` +
    `${a.crammed.length ? `  whole-¶-in-one-part: ${a.crammed.join(',')}` : ''}${a.mixedSections.length ? `  MIXED: ${a.mixedSections.join('; ')}` : ''}` +
    `${a.dupState.length ? `  DUP: ${a.dupState.join('; ')}` : ''}${a.dupEmit.length ? `  RE-AIMED: ${a.dupEmit.join('; ')}` : ''}`)
}

// ── Checks — identical for the controls and the live runs ────────────────────────────────────
const CHECKS_A = [
  { label: 'turn 1: a lock fired (not vacuous)', test: r => r.A.emissions.length >= 1 },
  { label: 'turn 1: every [DONE] payload is VERBATIM draft text', test: r => r.aA.nonVerbatim.length === 0 },
  { label: 'turn 1: no draft sentence locked into two places (state + emitted)', test: r => !r.aA.dupState.length && !r.aA.dupEmit.length },
  { label: 'turn 1: no section holds two draft paragraphs', test: r => !r.aA.mixedSections.length },
  { label: 'turn 1: ¶2 never lands in section 1', test: r => !r.aA.anywhere(1).includes(0) },
  { label: 'turn 1: all of ¶1 is in section 1 AND section 1 is complete (cursor advanced)', test: r => r.aA.fullyIn(0, 0) && r.aA.complete(0) && r.aA.cursor >= 1 },
  { label: 'turn 1: never re-emits [SCAFFOLD] over the existing structure', test: r => !r.A.rescaffold },
]
const CHECKS_B = [
  { label: 'after turn 2: every [DONE] payload is VERBATIM draft text', test: r => r.aB.nonVerbatim.length === 0 },
  { label: 'after turn 2: no draft sentence locked into two places (state + emitted, both turns)', test: r => !r.aB.dupState.length && !r.aB.dupEmit.length },
  { label: 'after turn 2: no section holds two draft paragraphs', test: r => !r.aB.mixedSections.length },
  { label: 'after turn 2: ¶1 is whole in section 1 only, ¶2 whole in section 2 only', test: r =>
      r.aB.fullyIn(0, 0) && r.aB.fullyIn(1, 1) && r.aB.anywhere(0).join() === '0' && r.aB.anywhere(1).join() === '1' },
  { label: 'after turn 2: sections 1 and 2 complete, cursor on section 3', test: r => r.aB.complete(0) && r.aB.complete(1) && r.aB.cursor >= 2 },
]

function evaluate(rawA, rawB) {
  const A = applyTurn(freshScaffold(), rawA)
  const aA = analyse(A.scaffold, A.emissions)
  const B = applyTurn(A.scaffold, rawB)
  const allEmissions = [...A.emissions, ...B.emissions]
  const aB = analyse(B.scaffold, allEmissions)
  return { A, aA, B, aB, allEmissions }
}

// ── POSITIVE CONTROL — hand-written replies, no API ──────────────────────────────────────────
// Each bad reply is a shape the eval actually produced; the detector must FIRE on it. The good
// replies must PASS every check, or the probe could never go green and would prove nothing.
const S = SENTENCES
const D = (id, text) => `[DONE:${id}:${text}]`
const CONTROLS = [
  { name: 'GOOD — ¶1 split across section 1 + PARA_DONE; ¶2 next turn into section 2',
    a: `Locked. ${D('hook', S[0][0])} ${D('context', S[0][1])} ${D('reflection', S[0][2])} ${D('connection', S[0][3])} [PARA_DONE:0:Walking the bike home] Paragraph two goes in next.`,
    b: `Done. ${D('hook', S[1].slice(0, 2).join(' '))} ${D('context', S[1][2])} ${D('reflection', S[1][3])} ${D('connection', S[1][4])} [PARA_DONE:1:Mrs. Delgado's fix]`,
    expect: { pass: true } },
  { name: 'GOOD — whole ¶1 in one part + PARA_DONE, whole ¶2 in section 2 same turn (option b shape)',
    a: `${D('hook', PARAS[0])} [PARA_DONE:0:Walking home] ${D('hook', PARAS[1])} [PARA_DONE:1:The fix]`,
    b: `Both are already in — section 3 is next.`,
    expect: { pass: true } },
  { name: 'BAD — eval shape: ¶1→hook, ¶2→context of section 1, no PARA_DONE',
    a: `${D('hook', PARAS[0])} ${D('context', PARAS[1])} Both locked in!`,
    b: `${D('context', PARAS[1])}`,
    expect: { fail: ['turn 1: no section holds two draft paragraphs', 'turn 1: ¶2 never lands in section 1', 'turn 1: all of ¶1 is in section 1 AND section 1 is complete (cursor advanced)', 'after turn 2: ¶1 is whole in section 1 only, ¶2 whole in section 2 only'] } },
  { name: 'BAD — re-lock duplicates ¶1 into section 2 on turn 2',
    a: `${D('hook', PARAS[0])} [PARA_DONE:0:Walking home]`,
    b: `${D('hook', PARAS[0])} ${D('context', PARAS[1])} [PARA_DONE:1:dup]`,
    expect: { fail: ['after turn 2: no draft sentence locked into two places (state + emitted, both turns)', 'after turn 2: no section holds two draft paragraphs'] } },
  { name: 'BAD — paraphrased "keep"',
    a: `${D('hook', 'My bike chain broke on Alder Hill and I had grease all over my hands.')} [PARA_DONE:0:x]`,
    b: ``,
    expect: { fail: ['turn 1: every [DONE] payload is VERBATIM draft text'] } },
]

console.log(`\nSynthetic starting draft: ${WORDS} words, ${PARAS.length} paragraphs (sentences per ¶: ${SENTENCES.map(s => s.length).join('/')})`)
console.log('\nPOSITIVE CONTROL — hand-written replies, no API call')
check('CONTROL: sentence splitter found every sentence', SENTENCES.every((ss, k) => norm(ss.join(' ')) === norm(PARAS[k])) && SENTENCES.map(s => s.length).join('/') === '4/5/5/4/2',
  `counts ${SENTENCES.map(s => s.length).join('/')}, expected 4/5/5/4/2`)
for (const c of CONTROLS) {
  const r = evaluate(c.a, c.b)
  const failed = [...CHECKS_A, ...CHECKS_B].filter(k => !k.test(r)).map(k => k.label)
  summarise(c.name, r.B.scaffold, r.aB, r.allEmissions)
  if (c.expect.pass) check(`CONTROL ${c.name}: passes every check`, failed.length === 0, failed.length ? `failed: ${failed.join(' | ')}` : '')
  else {
    const missing = c.expect.fail.filter(l => !failed.includes(l))
    check(`CONTROL ${c.name}: detector fires`, missing.length === 0, missing.length ? `did NOT fire: ${missing.join(' | ')}` : `fired ${failed.length} check(s)`)
  }
}
if (report('Starting-draft mapping — positive control') !== 0) {
  console.error('Control failed — the detector cannot be trusted; not spending on API calls.')
  process.exit(1)
}
if (CONTROL_ONLY) process.exit(0)

// ── LIVE — RUNS × (turn 1: "yes lock them both in", turn 2: "put the second one in too") ─────
await rateCheck({
  label: `MAPPING — keep ¶1+¶2 of a ${PARAS.length}-paragraph starting draft, then a re-lock turn`,
  runs: RUNS,
  threshold: 1,
  produce: async i => {
    budgetGuard()
    const scA = freshScaffold()
    const { text: rawA } = await coachTurn({ assignment: ASSIGNMENT, scaffold: scA, opts: { requirements: REQUIREMENTS, startingDraft: START }, messages: HISTORY_A })
    const A = applyTurn(scA, rawA)
    budgetGuard()
    // History carries the turn as the client commits it: tokens stripped (TutorSession).
    const historyB = [...HISTORY_A, { role: 'assistant', content: stripCoachTokens(rawA) }, { role: 'user', content: studentB(A.scaffold) }]
    const lockedWords = A.scaffold.components.flatMap(p => p.items).filter(it => it.status === 'confirmed').reduce((n, it) => n + norm(it.text).split(' ').length, 0)
    const { text: rawB } = await coachTurn({
      assignment: ASSIGNMENT, scaffold: A.scaffold,
      opts: { requirements: { ...REQUIREMENTS, actual: { words: lockedWords, paragraphs: A.scaffold.components.filter(p => p.status === 'complete').length } }, startingDraft: START },
      messages: historyB,
    })
    const r = evaluate(rawA, rawB)
    console.log(`\n── run ${i + 1}/${RUNS} ──`)
    console.log(`  turn 1 prose: ${stripCoachTokens(rawA).replace(/\s+/g, ' ').slice(0, 260)}…`)
    summarise('turn 1', r.A.scaffold, r.aA, r.A.emissions)
    console.log(`  turn 2 student: ${studentB(A.scaffold).slice(0, 70)}…`)
    console.log(`  turn 2 prose: ${stripCoachTokens(rawB).replace(/\s+/g, ' ').slice(0, 260)}…`)
    summarise('after turn 2', r.B.scaffold, r.aB, r.allEmissions)
    console.log(`  💲 running spend $${spent.toFixed(4)} (${calls} calls)`)
    return r
  },
  checks: [...CHECKS_A, ...CHECKS_B],
})

console.log(`\n💲 TOTAL: $${spent.toFixed(4)} across ${calls} API calls (claude-sonnet-4-6, from the API's usage fields)`)
process.exit(report('Starting-draft mapping — kept paragraphs land one per section') === 0 ? 0 : 1)
