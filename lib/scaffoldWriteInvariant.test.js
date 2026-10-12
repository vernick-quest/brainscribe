// THE GOVERNING INVARIANT for the [DONE:] write path (round 3, strongest form):
//
//   For every token sequence, the Draft after the CURRENT code must EQUAL the Draft after the
//   handler as it stood at 2238e2b — same cursor, same status on every part, same text in every
//   part — except where a listed no-write short-circuit explains the difference.
//
// History: rounds 1–2 added a BLOCKING duplicate refusal. Two adversarial reviews showed a
// refusal changes state, a changed state re-routes later tokens (Net A does not advance; the next
// shared id becomes an exact revision), and no local rule closes that. An earlier, weaker form of
// this test ("new Draft + banks ⊇ old Draft") passed a planted "bank everything, write nothing"
// bug 9/9 named and 5/6 generated. So: no banks count as kept, and the duplicate net is now
// observe-only (annotateDuplicates runs after the write and is included below, to prove it
// cannot change anything this test compares).
//
// Synthetic text (public repo). Deterministic: fixed-seed PRNG.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import {
  resolveWriteIndex, resolveComponentWrite, updateComponentItem, shouldPreserveExisting, resolveDoneText,
  decideDoneWrite, annotateDuplicates,
} from './scaffoldWrite'
import { buildDraftComponentTree } from './startingDraftScaffold'

let warn, error
beforeAll(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); error = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterAll(() => { warn.mockRestore(); error.mockRestore() })

// ── OLD: the [DONE:] item decision at 2238e2b (components/TutorSession.js), verbatim logic ──
const oldPreserve = (item, target) => ({ ...item, status: 'confirmed', text: item.text || item.nuggetText, writeDropped: false, revisionRefused: target?.crossSection ? 'cross-section' : 'inexact' })
function oldDecision({ target, item, inlineText }) {
  if (shouldPreserveExisting(target, item)) return { item: oldPreserve(item, target), outcome: 'preserved' }
  if (item.status === 'confirmed' && item.text && inlineText
      && item.text.length > inlineText.length
      && item.text.toLowerCase().includes(inlineText.trim().toLowerCase())) return { item, outcome: 'fragment' }
  const { text, dropped } = resolveDoneText(item, inlineText)
  if (dropped) return { item: { ...item, writeDropped: true }, outcome: 'dropped' }
  return { item: { ...item, status: 'confirmed', text, writeDropped: false }, outcome: 'written' }
}
// ── NEW: exactly what TutorSession runs — decideDoneWrite, then the observe-only detector ──
const newDecision = ({ target, item, inlineText }) => decideDoneWrite({ target, item, inlineText })

function makeApply(decide, { annotate = false } = {}) {
  return (sc, componentId, inlineText, log) => {
    const t = resolveComponentWrite(sc, resolveWriteIndex(sc), componentId, { assembledIndexes: [] })
    if (!t) { log.push(null); return sc }
    let out = updateComponentItem(sc, t.paraIdx, t.id, item => {
      const d = decide({ target: t, item, inlineText })
      log.push({ key: `${t.paraIdx}.${t.id}`, outcome: d.outcome })
      return d.item
    })
    if (annotate) out = annotateDuplicates(out, {}).scaffold
    return out
  }
}
// [PARA_DONE] (Net C) and Net A — identical in both, as in the client.
function paraDone(sc, emittedIdx) {
  const cur = sc.current_paragraph_index ?? 0
  const target = emittedIdx > cur ? cur : emittedIdx
  if (target < 0 || target >= sc.components.length) return sc
  return { ...sc, current_paragraph_index: Math.min(Math.max(cur, target + 1), sc.components.length),
    components: sc.components.map((p, i) => (i === target ? { ...p, status: 'complete' } : p)) }
}
function netA(sc) {
  if ((sc.components?.length ?? 0) <= 1) return sc
  let adv = sc.current_paragraph_index ?? 0
  const components = sc.components.map((p, i) => {
    const all = (p.items ?? []).length > 0 && p.items.every(it => it.status === 'confirmed')
    if (all && p.status !== 'complete') { if (i + 1 > adv) adv = i + 1; return { ...p, status: 'complete' } }
    return p
  })
  return { ...sc, components, current_paragraph_index: Math.min(adv, sc.components.length) }
}
function run(start, ops, apply, netAEach) {
  let sc = JSON.parse(JSON.stringify(start))
  const log = []
  for (const op of ops) {
    if (op.paraDone != null) { sc = paraDone(sc, op.paraDone); log.push(null) } else sc = apply(sc, op.id, op.text, log)
    if (netAEach) sc = netA(sc)
  }
  return { sc: netAEach ? sc : netA(sc), log }
}

// ── The ONLY allowed differences ────────────────────────────────────────────────────────────
// Both are the no-write short-circuits in decideDoneWrite, and both keep at least every word
// the old code kept in that part:
//   QUOTES   — old and new text are equal once quote style is ignored (step 0 kept the curly
//              original where the old code wrote back the straight-quote copy, or vice versa).
//   NO-WRITE — on some step this part was the target, the NEW decision was 'unchanged' or
//              'fragment' (no write) while the OLD decision was 'written', and the old final
//              text is contained in the new final text (quote style ignored). That is the old
//              code replacing a paragraph with a quoted fragment of itself; the new keeps it.
const nq = s => String(s ?? '').replace(/[‘’ʼ′]/g, "'").replace(/[“”″]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase()
export function allowedDifference(oldText, newText, noWriteDivergence) {
  if (nq(oldText) === nq(newText)) return 'QUOTES'
  if (noWriteDivergence && oldText && newText && nq(newText).includes(nq(oldText))) return 'NO-WRITE'
  return null
}
function diffDrafts(start, ops, netAEach, decide = newDecision) {
  const o = run(start, ops, makeApply(oldDecision), netAEach)
  const n = run(start, ops, makeApply(decide, { annotate: decide === newDecision }), netAEach)
  const divergedAt = new Set()
  o.log.forEach((ol, k) => {
    const nl = n.log[k]
    if (ol && nl && ol.key === nl.key && ol.outcome === 'written' && (nl.outcome === 'unchanged' || nl.outcome === 'fragment')) divergedAt.add(nl.key)
  })
  const problems = []
  if ((o.sc.current_paragraph_index ?? 0) !== (n.sc.current_paragraph_index ?? 0)) problems.push(`cursor ${o.sc.current_paragraph_index} vs ${n.sc.current_paragraph_index}`)
  o.sc.components.forEach((sec, i) => {
    if (sec.status !== n.sc.components[i]?.status) problems.push(`section ${i} status ${sec.status} vs ${n.sc.components[i]?.status}`)
    sec.items.forEach(it => {
      const ni = n.sc.components[i]?.items.find(x => x.id === it.id)
      if (it.status !== ni?.status) problems.push(`${i}.${it.id} status ${it.status} vs ${ni?.status}`)
      const ot = it.status === 'confirmed' ? (it.text || it.nuggetText || '') : ''
      const nt = ni?.status === 'confirmed' ? (ni.text || ni.nuggetText || '') : ''
      if (ot === nt) return
      if (!allowedDifference(ot, nt, divergedAt.has(`${i}.${it.id}`))) problems.push(`${i}.${it.id} text differs: old "${ot.slice(0, 40)}" new "${nt.slice(0, 40)}"`)
    })
  })
  return problems
}

// ── Fixtures (each ≥ 20 words, distinct) ──
const T = [
  'According to the city budget report, the east side received only twelve percent of road repair funding last year even though it holds forty percent of the population.',
  'This shows that the council has been ignoring the neighborhoods that need help the most, and that the people who live there have every reason to feel forgotten by city hall.',
  'The ferry horn sounded twice before I understood that my brother was not on the boat, and I stood on the dock holding his backpack while the water churned white.',
  "My aunt found me there an hour later and didn’t ask what happened; she bought two cups of cocoa from the snack window and waited until I was ready to talk.",
]
const NEW = [
  'Because of this, the council should split repair money by population instead of by complaints, which is the only fair way to fix it.',
  'After that summer I took the ferry alone every Saturday just to prove I could stand on that dock, and by August I barely noticed the horn.',
]
const derived = [
  ...T, ...NEW,
  T[0] + ' ' + NEW[0],                                   // contains (superset)
  T[2].replace('twice', 'two times'),                     // light edit
  T[3].replace(/’/g, "'"),                                // straight-quote copy of a curly paragraph
  'In conclusion, ' + T[1],                               // restatement
  'the east side received only twelve percent',           // fragment
  'my aunt found me there an hour later and didn\'t ask', // fragment across quote styles
  '',                                                      // bare lock
]
const legacy = () => ({ current_paragraph_index: 1, components: [
  { index: 0, type: 'body', status: 'complete', items: [
    { id: 'topic_sentence', status: 'confirmed', text: 'Roads matter.' }, { id: 'evidence', status: 'confirmed', text: T[2] },
    { id: 'analysis', status: 'confirmed', text: T[3] }, { id: 'transition', status: 'locked', text: null }] },
  { index: 1, type: 'body', status: 'working', items: [
    { id: 'topic_sentence', status: 'confirmed', text: 'Funding is unfair.' }, { id: 'evidence', status: 'confirmed', text: T[0] },
    { id: 'analysis', status: 'confirmed', text: T[1] }, { id: 'transition', status: 'working', text: null, nuggetText: NEW[0] }] },
  { index: 2, type: 'conclusion', status: 'locked', items: [
    { id: 'echo', status: 'locked', text: null }, { id: 'synthesis', status: 'locked', text: null },
    { id: 'thesis_restate', status: 'locked', text: null }, { id: 'closing', status: 'locked', text: null }] }] })
const draftShaped = () => {
  const components = buildDraftComponentTree(4)
  components[0].items[0] = { ...components[0].items[0], status: 'confirmed', text: T[2] }; components[0].status = 'complete'
  components[1].items[0] = { ...components[1].items[0], status: 'confirmed', text: T[3], nuggetText: 'an older captured nugget the student once said' }; components[1].status = 'complete'
  return { current_paragraph_index: 2, components }
}
const grownStory = () => ({ current_paragraph_index: 1, components: [
  { index: 0, type: 'narrative', status: 'complete', items: [
    { id: 'hook', status: 'confirmed', text: T[2] }, { id: 'context', status: 'confirmed', text: T[3] },
    { id: 'body', status: 'confirmed', text: 'x' }, { id: 'closing', status: 'confirmed', text: 'y' }] },
  { index: 1, type: 'custom', status: 'working', items: [{ id: 'c0', label: 'Scene 2', status: 'working', text: null }] },
  { index: 2, type: 'custom', status: 'locked', items: [{ id: 'c1', label: 'Scene 3', status: 'locked', text: null }] }] })

// Round-1/2 regression shapes, now asserted as old == new.
const named = [
  ['MOVE within a section (round-2 HIGH)', legacy, [{ id: 'evidence', text: T[1] }, { id: 'analysis', text: NEW[0] }]],
  ['MOVE within a section, across turns', legacy, [{ id: 'evidence', text: T[1] }, { paraDone: 1 }, { id: 'analysis', text: NEW[0] }]],
  ['SWAP within a section', legacy, [{ id: 'evidence', text: T[1] }, { id: 'analysis', text: T[0] }]],
  ['MOVE across sections (draft shape), then rewrite the source', draftShaped, [{ paraDone: 1 }, { id: 'c2', text: T[3] }, { id: 'c1', text: NEW[1] }]],
  ['CONTAIN: a lock that contains a confirmed paragraph', draftShaped, [{ id: 'c2', text: T[2] + ' ' + NEW[1] }]],
  ['RE-LOCK a paragraph into the next section (the eval duplicate)', draftShaped, [{ id: 'c2', text: T[3] }]],
  ['RESTATE: thesis_restate restating a body sentence', legacy, [{ paraDone: 1 }, { id: 'thesis_restate', text: 'In conclusion, ' + T[1] }]],
  ['OVER-EXTEND: an id past the end of a full scaffold', () => { const s = draftShaped(); s.components.forEach((p, i) => { p.status = 'complete'; p.items[0] = { ...p.items[0], status: 'confirmed', text: p.items[0].text ?? `Section ${i} already holds these words today.` } }); s.current_paragraph_index = 4; return s }, [{ id: 'c5', text: NEW[1] }]],
  ['REFRAIN across grown scenes', grownStory, [{ id: 'c0', text: T[2] }]],
  ['CURLY re-lock into its own part (step 0)', draftShaped, [{ paraDone: 1 }, { id: 'c1', text: T[3].replace(/’/g, "'") }]],
  ['CURLY fragment of its own part (fragment net)', draftShaped, [{ id: 'c1', text: 'my aunt found me there an hour later and didn\'t ask' }]],
  ['BARE [DONE] on a confirmed part whose nugget is STALE (must still match the old code)', draftShaped, [{ id: 'c1', text: '' }]],
  ['BARE [DONE] on a confirmed part with no nugget (step 0)', legacy, [{ id: 'evidence', text: '' }]],
  // The old code re-applies a STALE captured nugget on a bare re-lock; the step-0 no-op must not
  // pretend otherwise. (An unrestricted bare no-op fails this case.)
  ['BARE [DONE] after an inline lock over a captured nugget (local, stale nugget)', legacy, [{ id: 'transition', text: NEW[1] }, { id: 'transition', text: '' }]],
]

describe('governing invariant — named cases: new Draft == old Draft', () => {
  for (const [name, make, ops] of named) {
    it(name, () => {
      expect(diffDrafts(make(), ops, false)).toEqual([])
      expect(diffDrafts(make(), ops, true)).toEqual([])
    })
  }
})

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const shapes = [
  ['legacy prose', legacy, ['topic_sentence', 'evidence', 'analysis', 'transition', 'echo', 'thesis_restate', 'hook', 'c3']],
  ['starting-draft shape', draftShaped, ['c0', 'c1', 'c2', 'c3', 'c5', 'hook', 'context']],
  ['grown story', grownStory, ['hook', 'context', 'c0', 'c1', 'closing']],
]
function generated(make, ids, seed, count, maxLen, decide) {
  const rnd = mulberry32(seed)
  const pick = arr => arr[Math.floor(rnd() * arr.length)]
  const failures = []
  for (let n = 0; n < count; n++) {
    const len = 1 + Math.floor(rnd() * maxLen)
    const ops = Array.from({ length: len }, () => (rnd() < 0.15 ? { paraDone: Math.floor(rnd() * 4) } : { id: pick(ids), text: pick(derived) }))
    const netAEach = rnd() < 0.5
    const problems = diffDrafts(make(), ops, netAEach, decide)
    if (problems.length) failures.push({ ops: ops.map(o => o.paraDone != null ? `PD${o.paraDone}` : `${o.id}←${derived.indexOf(o.text)}`).join(' '), netAEach, problems })
    if (failures.length >= 3) break
  }
  return failures
}

describe('governing invariant — generated sequences (seeded): new Draft == old Draft', () => {
  for (const [name, make, ids] of shapes) for (const [count, maxLen] of [[3000, 6], [1500, 14]]) {
    it(`${name}: ${count} sequences of up to ${maxLen} tokens`, { timeout: 60000 }, () => {
      expect(generated(make, ids, 20261012 + name.length + maxLen, count, maxLen)).toEqual([])
    })
  }
})

describe('POSITIVE CONTROLS — the comparison must catch a broken write path', () => {
  // The planted bug the round-2 test let through: bank everything, write nothing.
  const bankNothingWritten = ({ item, inlineText }) => ({ item: { ...item, bank: [...(item.bank ?? []), inlineText] }, outcome: 'written' })
  // The round-1 design: refuse a lock whose exact text is confirmed anywhere else.
  const round1Refusal = ({ target, item, inlineText }) => {
    const d = oldDecision({ target, item, inlineText })
    return d.outcome === 'written' && inlineText && item.text !== inlineText && derived.slice(0, 4).includes(inlineText)
      ? { item, outcome: 'duplicate' } : d
  }
  it('"bank everything, write nothing" fires on EVERY named case where the old code changed a part\'s text', () => {
    const textOf = sc => JSON.stringify(sc.components.map(p => p.items.map(it => (it.status === 'confirmed' ? nq(it.text || it.nuggetText) : ''))))
    const oldWrote = named.filter(([, make, ops]) => textOf(run(make(), ops, makeApply(oldDecision), false).sc) !== textOf(make()))
    const fired = named.filter(([, make, ops]) => diffDrafts(make(), ops, false, bankNothingWritten).length > 0)
    expect(oldWrote.length).toBeGreaterThanOrEqual(8)
    expect(fired.map(c => c[0])).toEqual(oldWrote.map(c => c[0]))
  })
  it('"bank everything, write nothing" fires on EVERY generated shape', () => {
    for (const [, make, ids] of shapes) expect(generated(make, ids, 7, 300, 6, bankNothingWritten).length).toBeGreaterThan(0)
  })
  it('a blocking refusal (the round-1/2 design) fires on the move case and on generated sequences', () => {
    expect(diffDrafts(legacy(), named[0][2], false, round1Refusal).length).toBeGreaterThan(0)
    expect(generated(legacy, shapes[0][2], 11, 500, 6, round1Refusal).length).toBeGreaterThan(0)
  })
  it('allowedDifference is narrow: different words are never "allowed"', () => {
    expect(allowedDifference(T[0], T[1], true)).toBeNull()
    expect(allowedDifference(T[0], 'the east side', true)).toBeNull()           // new LOST words
    expect(allowedDifference('the east side received only twelve percent', T[0], false)).toBeNull()  // no no-op step
    expect(allowedDifference(T[3], T[3].replace(/’/g, "'"), false)).toBe('QUOTES')
  })
})
