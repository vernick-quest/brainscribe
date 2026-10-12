// Adversarial-review findings on the duplicate net (rounds 2–3, 2026-10-11/12), as permanent
// tests. Round 3 made the net OBSERVE-ONLY, so each write-path case below asserts the 2238e2b
// handler's result (the differential proof lives in scaffoldWriteInvariant.test.js) and each
// duplicate case asserts the detector FLAGS without blocking. Synthetic text (public repo).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resolveWriteIndex, resolveComponentWrite, updateComponentItem, decideDoneWrite,
  isNearDuplicate, findConfirmedDuplicate, annotateDuplicates,
} from './scaffoldWrite'
import { buildDraftComponentTree, draftSectionCount } from './startingDraftScaffold'
import { scaffoldTooSmallForMinimum } from './requirements'

let warn, error
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); error = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { warn.mockRestore(); error.mockRestore() })

const E = 'According to the city budget report, the east side received only twelve percent of road repair funding last year even though it holds forty percent of the population.'
const A = 'This shows that the council has been ignoring the neighborhoods that need help the most, and that the people who live there have every reason to feel forgotten by city hall.'
const N = 'Because of this, the council should split repair money by population instead of by complaints.'
const T = 'Schools should start later in the morning because teenagers need more sleep, they perform better on tests when rested, and they drive more safely after sunrise.'
const P1 = 'My grandmother kept a garden behind her house in Fresno and every summer she let me pick the tomatoes before anyone else was awake.'
const PX = 'The second paragraph talks about how my family moved three times before I turned ten, and each time I had to learn a new bus route and make new friends at lunch.'
const CURLY = "I’d never been good at asking for help. My dad’s rule was that you figure it out yourself, and I’d taken that so seriously that I couldn’t even ask a teacher when I didn’t understand the homework. It wasn’t pride exactly. It was more like I was scared they’d find out I wasn’t as smart as everyone thought."
const STRAIGHT = CURLY.replace(/[’‘]/g, "'")

// One [DONE:] exactly as the client applies it (decideDoneWrite), then the detector.
function done(sc, id, text) {
  const target = resolveComponentWrite(sc, resolveWriteIndex(sc), id, {})
  let outcome
  const written = updateComponentItem(sc, target.paraIdx, target.id, it => { const d = decideDoneWrite({ target, item: it, inlineText: text }); outcome = d.outcome; return d.item })
  return { sc: annotateDuplicates(written, {}).scaffold, outcome }
}
const bodySection = () => ({ current_paragraph_index: 1, components: [
  { type: 'introduction', status: 'complete', items: [{ id: 'hook', status: 'confirmed', text: 'x' }] },
  { type: 'body', status: 'working', items: [
    { id: 'topic_sentence', status: 'confirmed', text: 'The east side deserves fair road funding.' },
    { id: 'evidence', status: 'confirmed', text: E }, { id: 'analysis', status: 'confirmed', text: A },
    { id: 'transition', status: 'working', text: null }] }] })

describe('#1 — moves and swaps between sibling parts land exactly as before the net', () => {
  it('[DONE:evidence:A][DONE:analysis:N] → evidence holds A, analysis holds N', () => {
    let { sc } = done(bodySection(), 'evidence', A)
    ;({ sc } = done(sc, 'analysis', N))
    const items = sc.components[1].items
    expect(items.find(i => i.id === 'evidence').text).toBe(A)
    expect(items.find(i => i.id === 'analysis').text).toBe(N)
  })
  it('the swap: evidence ← A, analysis ← E', () => {
    let { sc } = done(bodySection(), 'evidence', A)
    ;({ sc } = done(sc, 'analysis', E))
    const items = sc.components[1].items
    expect(items.find(i => i.id === 'evidence').text).toBe(A)
    expect(items.find(i => i.id === 'analysis').text).toBe(E)
  })
  it('across sections (draft shape): ¶2 copied into section 3 is FLAGGED; rewriting section 2 clears the flag', () => {
    let sc = { components: buildDraftComponentTree(4), current_paragraph_index: 1 }
    sc.components[1].items[0] = { ...sc.components[1].items[0], status: 'confirmed', text: PX }
    let r = done(sc, 'c2', PX)
    expect(r.outcome).toBe('written')                                          // never blocked
    expect(r.sc.components[2].items[0].text).toBe(PX)
    expect(r.sc.components[2].items[0].duplicateOf).toMatchObject({ paraIdx: 1, label: 'Paragraph 2' })
    expect(r.sc.components[1].items[0].duplicateOf).toMatchObject({ paraIdx: 2, label: 'Paragraph 3' })
    r = done(r.sc, 'c1', 'A brand new paragraph two about soccer practice and how the coach made everyone run laps in the rain until we laughed.')
    expect(r.sc.components[2].items[0].text).toBe(PX)
    expect(r.sc.components[2].items[0].duplicateOf).toBeUndefined()            // the copy is gone → flag gone
    expect(r.sc.components[1].items[0].duplicateOf).toBeUndefined()
  })
})

describe('#2 — the detector is one-way containment', () => {
  it('a 79-word lock that contains a 24-word paragraph is written whole; the CONTAINED paragraph is flagged', () => {
    const NEW = 'This summer I finally understood why she did that. ' + P1 + ' She wanted me to feel the quiet of the morning, the cold dew on the leaves, and the weight of something I had helped grow. Now I keep a garden of my own on our apartment balcony, and I wake up early just like she did.'
    let sc = { components: buildDraftComponentTree(4), current_paragraph_index: 1 }
    sc.components[0].items[0] = { ...sc.components[0].items[0], status: 'confirmed', text: P1 }
    sc.components[0].status = 'complete'
    const r = done(sc, 'c1', NEW)
    expect(r.outcome).toBe('written')
    expect(r.sc.components[1].items[0].text).toBe(NEW)
    expect(r.sc.components[1].items[0].duplicateOf).toBeUndefined()            // the bigger lock is not "a copy"
    expect(r.sc.components[0].items[0].duplicateOf).toMatchObject({ paraIdx: 1 }) // P1's words ARE in the Draft twice
  })
})

describe('#3 — legitimate restatements are written and never flagged', () => {
  const conclusion = () => ({ current_paragraph_index: 2, components: [
    { type: 'introduction', status: 'complete', items: [{ id: 'hook', status: 'confirmed', text: 'x' }, { id: 'thesis', status: 'confirmed', text: T }] },
    { type: 'body', status: 'complete', items: [{ id: 'topic_sentence', status: 'confirmed', text: 'y' }] },
    { type: 'conclusion', status: 'working', items: [{ id: 'echo', status: 'working', text: null }, { id: 'synthesis', status: 'locked', text: null }, { id: 'thesis_restate', status: 'locked', text: null }, { id: 'closing', status: 'locked', text: null }] }] })
  for (const [name, id, text] of [
    ['thesis_restate = "In conclusion, " + thesis', 'thesis_restate', 'In conclusion, ' + T],
    ['thesis_restate = "To sum up," + a light edit', 'thesis_restate', 'To sum up, schools should start later in the morning because teenagers need more sleep, they perform better on tests when rested, and they drive more safely after sunrise.'],
    ['an echo item restating the thesis', 'echo', T],
  ]) {
    it(name, () => {
      const r = done(conclusion(), id, text)
      expect(r.outcome).toBe('written')
      expect(r.sc.components[2].items.find(i => i.id === id).duplicateOf).toBeUndefined()
    })
  }
  it('a 20+ word refrain repeated across GROWN narrative scenes', () => {
    const refrain = 'And every night the river kept on rising and the town kept on sleeping, as if nobody had told it what the water already knew.'
    const sc = { current_paragraph_index: 2, components: [
      { type: 'narrative', status: 'complete', items: [{ id: 'hook', status: 'confirmed', text: refrain }, { id: 'context', status: 'confirmed', text: 'a' }, { id: 'body', status: 'confirmed', text: 'b' }, { id: 'closing', status: 'confirmed', text: 'c' }] },
      { type: 'custom', status: 'complete', items: [{ id: 'c0', label: 'Scene 2', status: 'confirmed', text: 'Scene two words.' }] },
      { type: 'custom', status: 'working', items: [{ id: 'c1', label: 'Scene 3', status: 'working', text: null }] }] }
    const r = done(sc, 'c1', refrain)
    expect(r.outcome).toBe('written')
    expect(r.sc.components[2].items[0].duplicateOf).toBeUndefined()
  })
})

describe('#4 — curly quotes', () => {
  it('the detector sees a 58-word paragraph with 8 curly apostrophes as its straight-quote copy', () => {
    expect(CURLY.split(/\s+/).length).toBe(58)
    expect(isNearDuplicate(STRAIGHT, CURLY)).toBe(true)
  })
  it('a re-lock differing only in quote style is UNCHANGED (no false "a change didn\'t apply" stamp)', () => {
    let sc = { components: buildDraftComponentTree(3), current_paragraph_index: 1 }
    sc.components[0].items[0] = { ...sc.components[0].items[0], status: 'confirmed', text: CURLY }
    const r = done(sc, 'c0', STRAIGHT)                // cross-section into a filled part
    expect(r.outcome).toBe('unchanged')
    expect(r.sc.components[0].items[0].revisionRefused).toBeUndefined()
    expect(r.sc.components[0].items[0].text).toBe(CURLY)
  })
  it('the fragment net also sees through quote style', () => {
    const item = { id: 'c0', status: 'confirmed', text: CURLY }
    expect(decideDoneWrite({ target: { paraIdx: 0, id: 'c0', exact: true }, item, inlineText: "My dad's rule was that you figure it out yourself" }).outcome).toBe('fragment')
  })
})

describe('#5 — size warning and the over-the-end id', () => {
  it('five one-part draft sections cannot hold a 1,200-word minimum → warned', () => {
    expect(scaffoldTooSmallForMinimum({ type: 'words', min: 1200 }, buildDraftComponentTree(5))).toMatchObject({ sections: 5 })
  })
  it('a haiku-style custom section is still skipped', () => {
    expect(scaffoldTooSmallForMinimum({ type: 'words', min: 1200 }, [{ type: 'custom', items: [{ id: 'c0' }, { id: 'c1' }, { id: 'c2' }] }])).toBeNull()
  })
  it('[DONE:c5:…] on a full 5-section draft scaffold behaves exactly as before: preserved, nothing overwritten', () => {
    let sc = { components: buildDraftComponentTree(5), current_paragraph_index: 5 }
    sc.components.forEach((s, i) => { s.status = 'complete'; s.items[0] = { ...s.items[0], status: 'confirmed', text: `Paragraph ${i} text that is already here.` } })
    const r = done(sc, 'c5', "Last month my friend Jaylen's chain snapped outside school and I walked him through the fix.")
    expect(r.outcome).toBe('preserved')
    expect(r.sc.components[4].items[0].text).toBe('Paragraph 4 text that is already here.')
  })
  it('draftSectionCount is a real ceiling', () => {
    expect(draftSectionCount(40, 3)).toBeLessThanOrEqual(20)
  })
})

describe('#8 — flags name the paragraph, not a bare id', () => {
  it('a duplicate of a legacy part is labelled "Paragraph 1 (Context)"', () => {
    const sc = { components: [
      { type: 'personal_statement', items: [{ id: 'hook', label: 'Hook', status: 'confirmed', text: 'a' }, { id: 'context', label: 'Context', status: 'confirmed', text: PX }] },
      { type: 'personal_statement', items: [{ id: 'hook', label: 'Hook', status: 'working', text: null }] }] }
    expect(findConfirmedDuplicate(sc, 1, 'hook', PX).label).toBe('Paragraph 1 (Context)')
  })
})

describe('annotateDuplicates — observe-only, recomputed, self-clearing', () => {
  const twoCopies = () => {
    const components = buildDraftComponentTree(3)
    components[0].items[0] = { ...components[0].items[0], status: 'confirmed', text: PX }
    components[1].items[0] = { ...components[1].items[0], status: 'confirmed', text: PX }
    return { current_paragraph_index: 2, components }
  }
  it('changes ONLY the flag field — never text, status, nugget or cursor', () => {
    const before = twoCopies()
    const { scaffold, changed, flagged } = annotateDuplicates(before)
    expect(changed).toBe(true)
    expect(flagged.map(f => f.paraIdx)).toEqual([0, 1])
    const strip = sc => JSON.stringify({ ...sc, components: sc.components.map(p => ({ ...p, items: p.items.map(({ duplicateOf, ...rest }) => rest) })) })
    expect(strip(scaffold)).toBe(strip(before))
  })
  it('returns the SAME object when nothing changed (no needless persist)', () => {
    const once = annotateDuplicates(twoCopies()).scaffold
    const again = annotateDuplicates(once)
    expect(again.changed).toBe(false)
    expect(again.scaffold).toBe(once)
  })
  it('clears every flag once the second copy is edited away', () => {
    const flagged = annotateDuplicates(twoCopies()).scaffold
    const edited = updateComponentItem(flagged, 1, 'c1', it => ({ ...it, text: 'Completely different words the student wrote instead, about a summer job at the pool snack bar.' }))
    const r = annotateDuplicates(edited)
    expect(r.flagged).toEqual([])
    expect(r.scaffold.components.every(p => p.items.every(it => !('duplicateOf' in it)))).toBe(true)
  })
  it('ignores candidates — only CONFIRMED text is in the Draft', () => {
    const sc = twoCopies()
    sc.components[1].items[0] = { ...sc.components[1].items[0], status: 'candidate', text: null, nuggetText: PX }
    expect(annotateDuplicates(sc).flagged).toEqual([])
  })
  it('counts another section\'s paragraphs ROW', () => {
    const components = buildDraftComponentTree(3)
    components[1].items[0] = { ...components[1].items[0], status: 'confirmed', text: PX }
    const r = annotateDuplicates({ components }, { paragraphs: [{ paragraph_index: 0, scribed_text: PX }] })
    expect(r.flagged).toEqual([{ paraIdx: 1, id: 'c1', of: { paraIdx: 0, id: null, label: 'Paragraph 1' } }])
  })
})
