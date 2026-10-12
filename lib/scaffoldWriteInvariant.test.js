// THE GOVERNING INVARIANT for every safety net on the [DONE:] write path (round-2 review):
//
//   No sequence of coach tokens may make confirmed text vanish from everywhere — the Draft AND
//   the recoverable banks on the item — where the pre-change code would have kept it.
//
// The first duplicate refusal broke this: a refused move between two parts of one section,
// followed by an ordinary revision of the source part, destroyed the moved paragraph. Each
// step passed review alone. So this test is DIFFERENTIAL: it runs the same token sequences
// through the handler exactly as it stood at 2238e2b (frozen below, verbatim) and through the
// current applyDoneWrite, and fails if any text the old code left in the Draft is missing from
// the new code's Draft + banks. Named cases first (move, swap, contain, restate, over-extend),
// then a seeded generated set over three scaffold shapes.
//
// Synthetic text (public repo). Deterministic: a fixed-seed PRNG, no Math.random.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import {
  resolveWriteIndex, resolveComponentWrite, updateComponentItem, shouldPreserveExisting, resolveDoneText,
  applyDoneWrite,
} from './scaffoldWrite'
import { buildDraftComponentTree } from './startingDraftScaffold'

let warn, error
beforeAll(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); error = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterAll(() => { warn.mockRestore(); error.mockRestore() })

// ── OLD: the [DONE:] item decision at 2238e2b (components/TutorSession.js), verbatim logic ──
// preserveExistingItem as it was at 2238e2b (no refusedText bank).
const oldPreserve = (item, target) => ({ ...item, status: 'confirmed', text: item.text || item.nuggetText, writeDropped: false, revisionRefused: target?.crossSection ? 'cross-section' : 'inexact' })
function oldDone(sc, componentId, inlineText) {
  const paraIdx = resolveWriteIndex(sc)
  const t = resolveComponentWrite(sc, paraIdx, componentId, { assembledIndexes: [] })
  if (!t) return sc
  return updateComponentItem(sc, t.paraIdx, t.id, item => {
    if (shouldPreserveExisting(t, item)) return oldPreserve(item, t)
    if (item.status === 'confirmed' && item.text && inlineText
        && item.text.length > inlineText.length
        && item.text.toLowerCase().includes(inlineText.trim().toLowerCase())) return item
    const { text, dropped } = resolveDoneText(item, inlineText)
    if (dropped) return { ...item, writeDropped: true }
    return { ...item, status: 'confirmed', text, writeDropped: false }
  })
}
// ── NEW: exactly what TutorSession's DONE handler now runs ──
function newDone(sc, componentId, inlineText) {
  const paraIdx = resolveWriteIndex(sc)
  const t = resolveComponentWrite(sc, paraIdx, componentId, { assembledIndexes: [] })
  if (!t) return sc
  return applyDoneWrite(sc, t, inlineText, {}).scaffold
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
  for (const op of ops) {
    sc = op.paraDone != null ? paraDone(sc, op.paraDone) : apply(sc, op.id, op.text)
    if (netAEach) sc = netA(sc)
  }
  return netAEach ? sc : netA(sc)
}

// ── Presence ──
const norm = s => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase()
const draftTexts = sc => sc.components.flatMap(p => p.items.filter(it => it.status === 'confirmed').map(it => it.text || it.nuggetText)).filter(Boolean)
const anywhereTexts = sc => sc.components.flatMap(p => p.items.flatMap(it => [it.text, it.nuggetText, it.duplicateOf?.text, it.refusedText, ...(it.replaced ?? [])])).filter(Boolean)
const inside = (pool, t) => pool.some(x => norm(x).includes(norm(t)))
function lostByNew(start, ops, netAEach) {
  const oldEnd = run(start, ops, oldDone, netAEach)
  const newEnd = run(start, ops, newDone, netAEach)
  const universe = [...new Set([...draftTexts(start), ...ops.map(o => o.text).filter(Boolean)])]
  const oldDraft = draftTexts(oldEnd), newAll = anywhereTexts(newEnd)
  return universe.filter(u => norm(u) && inside(oldDraft, u) && !inside(newAll, u))
}

// ── Fixture text (each ≥ 20 words, distinct) ──
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
  '',                                                      // bare lock
]
const legacy = () => ({ current_paragraph_index: 1, components: [
  { index: 0, type: 'body', status: 'complete', items: [
    { id: 'topic_sentence', status: 'confirmed', text: 'Roads matter.' }, { id: 'evidence', status: 'confirmed', text: T[2] },
    { id: 'analysis', status: 'confirmed', text: T[3] }, { id: 'transition', status: 'locked', text: null }] },
  { index: 1, type: 'body', status: 'working', items: [
    { id: 'topic_sentence', status: 'confirmed', text: 'Funding is unfair.' }, { id: 'evidence', status: 'confirmed', text: T[0] },
    { id: 'analysis', status: 'confirmed', text: T[1] }, { id: 'transition', status: 'working', text: null }] },
  { index: 2, type: 'conclusion', status: 'locked', items: [
    { id: 'echo', status: 'locked', text: null }, { id: 'synthesis', status: 'locked', text: null },
    { id: 'thesis_restate', status: 'locked', text: null }, { id: 'closing', status: 'locked', text: null }] }] })
const draftShaped = () => {
  const components = buildDraftComponentTree(4)
  components[0].items[0] = { ...components[0].items[0], status: 'confirmed', text: T[2] }; components[0].status = 'complete'
  components[1].items[0] = { ...components[1].items[0], status: 'confirmed', text: T[3] }; components[1].status = 'complete'
  return { current_paragraph_index: 2, components }
}
const grownStory = () => ({ current_paragraph_index: 1, components: [
  { index: 0, type: 'narrative', status: 'complete', items: [
    { id: 'hook', status: 'confirmed', text: T[2] }, { id: 'context', status: 'confirmed', text: T[3] },
    { id: 'body', status: 'confirmed', text: 'x' }, { id: 'closing', status: 'confirmed', text: 'y' }] },
  { index: 1, type: 'custom', status: 'working', items: [{ id: 'c0', label: 'Scene 2', status: 'working', text: null }] },
  { index: 2, type: 'custom', status: 'locked', items: [{ id: 'c1', label: 'Scene 3', status: 'locked', text: null }] }] })

describe('governing invariant — named cases', () => {
  const cases = [
    ['MOVE within a section (the HIGH finding)', legacy, [{ id: 'evidence', text: T[1] }, { id: 'analysis', text: NEW[0] }]],
    ['MOVE within a section, across turns with a PARA_DONE between', legacy, [{ id: 'evidence', text: T[1] }, { paraDone: 1 }, { id: 'analysis', text: NEW[0] }]],
    ['SWAP within a section', legacy, [{ id: 'evidence', text: T[1] }, { id: 'analysis', text: T[0] }]],
    ['MOVE across sections (draft shape), then rewrite the source', draftShaped, [{ paraDone: 1 }, { id: 'c2', text: T[3] }, { id: 'c1', text: NEW[1] }]],
    ['CONTAIN: a lock that contains a confirmed paragraph', draftShaped, [{ id: 'c2', text: T[2] + ' ' + NEW[1] }]],
    ['RESTATE: thesis_restate restating a body sentence', legacy, [{ paraDone: 1 }, { id: 'thesis_restate', text: 'In conclusion, ' + T[1] }]],
    ['OVER-EXTEND: an id past the end of a full scaffold', () => { const s = draftShaped(); s.components.forEach((p, i) => { p.status = 'complete'; p.items[0] = { ...p.items[0], status: 'confirmed', text: p.items[0].text ?? `Section ${i} already holds these words today.` } }); s.current_paragraph_index = 4; return s }, [{ id: 'c5', text: NEW[1] }]],
    ['REFRAIN across grown scenes', grownStory, [{ id: 'c0', text: T[2] }]],
    ['CURLY re-lock into another section, then the source rewritten', draftShaped, [{ id: 'c2', text: T[3].replace(/’/g, "'") }, { paraDone: 2 }, { id: 'c1', text: NEW[0] }]],
  ]
  for (const [name, make, ops] of cases) {
    it(name, () => {
      expect(lostByNew(make(), ops, false)).toEqual([])
      expect(lostByNew(make(), ops, true)).toEqual([])
    })
  }
})

describe('governing invariant — generated sequences (seeded)', () => {
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
  const shapes = [
    ['legacy prose', legacy, ['topic_sentence', 'evidence', 'analysis', 'transition', 'echo', 'thesis_restate', 'hook', 'c3']],
    ['starting-draft shape', draftShaped, ['c0', 'c1', 'c2', 'c3', 'c5', 'hook', 'context']],
    ['grown story', grownStory, ['hook', 'context', 'c0', 'c1', 'closing']],
  ]
  // Two tiers. Long sequences matter: the bank is capped (REPLACED_BANK_SIZE = 10 versions per
  // part), and at a cap of 3 or 5 sequences of up to 14 tokens DID lose text; 8 was the
  // smallest cap that held across 60,000 such sequences (2026-10-11), 10 leaves margin.
  for (const [name, make, ids] of shapes) for (const [count, maxLen] of [[3000, 6], [1500, 14]]) {
    it(`${name}: ${count} random sequences of up to ${maxLen} tokens, new code never loses text the old code kept`, { timeout: 60000 }, () => {
      const rnd = mulberry32(20261011 + name.length + maxLen)
      const pick = arr => arr[Math.floor(rnd() * arr.length)]
      const failures = []
      for (let n = 0; n < count; n++) {
        const len = 1 + Math.floor(rnd() * maxLen)
        const ops = Array.from({ length: len }, () => (rnd() < 0.15 ? { paraDone: Math.floor(rnd() * 4) } : { id: pick(ids), text: pick(derived) }))
        const netAEach = rnd() < 0.5
        const lost = lostByNew(make(), ops, netAEach)
        if (lost.length) failures.push({ ops: ops.map(o => o.paraDone != null ? `PARA_DONE:${o.paraDone}` : `${o.id}←${derived.indexOf(o.text)}`).join(' '), netAEach, lost: lost.map(l => derived.indexOf(l)) })
        if (failures.length >= 3) break
      }
      expect(failures).toEqual([])
    })
  }
  it('POSITIVE CONTROL: the detector catches the round-1 bug (refusal with siblings counted, no bank, no move)', () => {
    // Re-create the round-1 decision: a sibling counted as "another part", nothing banked.
    const round1 = (sc, componentId, inlineText) => {
      const t = resolveComponentWrite(sc, resolveWriteIndex(sc), componentId, { assembledIndexes: [] })
      if (!t) return sc
      return updateComponentItem(sc, t.paraIdx, t.id, item => {
        if (shouldPreserveExisting(t, item)) return oldPreserve(item, t)
        const { text, dropped } = resolveDoneText(item, inlineText)
        if (dropped) return { ...item, writeDropped: true }
        const elsewhere = sc.components.some((p, i) => p.items.some(it => !(i === t.paraIdx && it.id === t.id) && it.status === 'confirmed' && norm(it.text) === norm(text)))
        if (elsewhere) return { ...item, duplicateOf: { paraIdx: -1 } }
        return { ...item, status: 'confirmed', text, writeDropped: false }
      })
    }
    const ops = [{ id: 'evidence', text: T[1] }, { id: 'analysis', text: NEW[0] }]
    const oldEnd = run(legacy(), ops, oldDone, false), badEnd = run(legacy(), ops, round1, false)
    const universe = [...new Set([...draftTexts(legacy()), ...ops.map(o => o.text)])]
    const lost = universe.filter(u => inside(draftTexts(oldEnd), u) && !inside(anywhereTexts(badEnd), u))
    if (JSON.stringify(lost) !== JSON.stringify([T[1]])) console.log('CONTROL lost =', lost, JSON.stringify(badEnd.components[1].items))
    expect(lost).toEqual([T[1]])
  })
})
