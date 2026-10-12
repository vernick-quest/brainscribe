// Round-2 adversarial findings on the duplicate refusal (2026-10-11 late), turned into
// permanent tests. Each was a $0 repro script from the independent review; each FAILED on
// commit af18d99 (verified before the fix — see TESTING.md). Synthetic text (public repo).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resolveWriteIndex, resolveComponentWrite, updateComponentItem, decideDoneWrite, applyDoneWrite,
  isNearDuplicate, findConfirmedDuplicate, clearDuplicateStamp,
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

// One [DONE:] exactly as the client applies it now (applyDoneWrite = decideDoneWrite + the
// deferred move), from the cursor.
function done(sc, id, text) {
  const target = resolveComponentWrite(sc, resolveWriteIndex(sc), id, {})
  const r = applyDoneWrite(sc, target, text, {})
  return { sc: r.scaffold, outcome: r.outcome }
}
const everywhere = sc => JSON.stringify(sc)
const bodySection = () => ({ current_paragraph_index: 1, components: [
  { type: 'introduction', status: 'complete', items: [{ id: 'hook', status: 'confirmed', text: 'x' }] },
  { type: 'body', status: 'working', items: [
    { id: 'topic_sentence', status: 'confirmed', text: 'The east side deserves fair road funding.' },
    { id: 'evidence', status: 'confirmed', text: E }, { id: 'analysis', status: 'confirmed', text: A },
    { id: 'transition', status: 'working', text: null }] }] })

describe('#1 HIGH — a move between sibling parts must never destroy the moved text (dup3)', () => {
  it('same turn: [DONE:evidence:A][DONE:analysis:N] → evidence holds A, analysis holds N (the pre-change result)', () => {
    let { sc } = done(bodySection(), 'evidence', A)
    ;({ sc } = done(sc, 'analysis', N))
    const items = sc.components[1].items
    expect(items.find(i => i.id === 'evidence').text).toBe(A)
    expect(items.find(i => i.id === 'analysis').text).toBe(N)
  })
  it('the swap: evidence ← A, analysis ← E — both texts survive', () => {
    let { sc } = done(bodySection(), 'evidence', A)
    ;({ sc } = done(sc, 'analysis', E))
    const items = sc.components[1].items
    expect(items.find(i => i.id === 'evidence').text).toBe(A)      // the swap the coach asked for
    expect(items.find(i => i.id === 'analysis').text).toBe(E)
  })
  it('across sections (draft shape): a refused move of ¶2 into section 3, then new words into section 2 → ¶2 LANDS in section 3', () => {
    let sc = { components: buildDraftComponentTree(4), current_paragraph_index: 1 }
    sc.components[1].items[0] = { ...sc.components[1].items[0], status: 'confirmed', text: PX }
    let r = done(sc, 'c2', PX)                     // cross-section into empty section 3: a duplicate → refused, banked
    expect(r.outcome).toBe('duplicate')
    r = done(r.sc, 'c1', 'A brand new paragraph two about soccer practice and how the coach made everyone run laps in the rain until we laughed.')
    expect(r.sc.components[1].items[0].text).toMatch(/soccer practice/)
    expect(r.sc.components[2].items[0].text).toBe(PX)                     // the deferred move
    expect(r.sc.components[2].items[0].duplicateOf ?? null).toBeNull()
  })
})

describe('#2 — a lock that CONTAINS a confirmed paragraph is written, not refused (dup A)', () => {
  it('79-word superset of a 24-word paragraph lands whole', () => {
    const NEW = 'This summer I finally understood why she did that. ' + P1 + ' She wanted me to feel the quiet of the morning, the cold dew on the leaves, and the weight of something I had helped grow. Now I keep a garden of my own on our apartment balcony, and I wake up early just like she did.'
    let sc = { components: buildDraftComponentTree(4), current_paragraph_index: 1 }
    sc.components[0].items[0] = { ...sc.components[0].items[0], status: 'confirmed', text: P1 }
    sc.components[0].status = 'complete'
    const r = done(sc, 'c1', NEW)
    expect(r.outcome).toBe('written')
    expect(r.sc.components[1].items[0].text).toBe(NEW)
  })
  it('a lock MOSTLY contained in another part is refused — and its text is BANKED on the part, never discarded', () => {
    let sc = { components: buildDraftComponentTree(3), current_paragraph_index: 1 }
    sc.components[0].items[0] = { ...sc.components[0].items[0], status: 'confirmed', text: PX }
    const r = done(sc, 'c1', PX + ' Lunch was the worst part.')
    expect(r.outcome).toBe('duplicate')
    expect(r.sc.components[1].items[0].duplicateOf.text).toBe(PX + ' Lunch was the worst part.')
  })
})

describe('#3 — legitimate verbatim restatements are not refused (dup2)', () => {
  const conclusion = () => ({ current_paragraph_index: 2, components: [
    { type: 'introduction', status: 'complete', items: [{ id: 'hook', status: 'confirmed', text: 'x' }, { id: 'thesis', status: 'confirmed', text: T }] },
    { type: 'body', status: 'complete', items: [{ id: 'topic_sentence', status: 'confirmed', text: 'y' }] },
    { type: 'conclusion', status: 'working', items: [{ id: 'echo', status: 'working', text: null }, { id: 'synthesis', status: 'locked', text: null }, { id: 'thesis_restate', status: 'locked', text: null }, { id: 'closing', status: 'locked', text: null }] }] })
  it('thesis_restate = "In conclusion, " + thesis', () => {
    expect(done(conclusion(), 'thesis_restate', 'In conclusion, ' + T).outcome).toBe('written')
  })
  it('thesis_restate = "To sum up," + a light edit', () => {
    expect(done(conclusion(), 'thesis_restate', 'To sum up, schools should start later in the morning because teenagers need more sleep, they perform better on tests when rested, and they drive more safely after sunrise.').outcome).toBe('written')
  })
  it('an echo item restating the thesis', () => {
    expect(done(conclusion(), 'echo', T).outcome).toBe('written')
  })
  it('a 20+ word refrain repeated across GROWN narrative scenes (not a starting-draft shape)', () => {
    const refrain = 'And every night the river kept on rising and the town kept on sleeping, as if nobody had told it what the water already knew.'
    const sc = { current_paragraph_index: 2, components: [
      { type: 'narrative', status: 'complete', items: [{ id: 'hook', status: 'confirmed', text: refrain }, { id: 'context', status: 'confirmed', text: 'a' }, { id: 'body', status: 'confirmed', text: 'b' }, { id: 'closing', status: 'confirmed', text: 'c' }] },
      { type: 'custom', status: 'complete', items: [{ id: 'c0', label: 'Scene 2', status: 'confirmed', text: 'Scene two words.' }] },
      { type: 'custom', status: 'working', items: [{ id: 'c1', label: 'Scene 3', status: 'working', text: null }] }] }
    expect(done(sc, 'c1', refrain).outcome).toBe('written')
  })
})

describe('#4 — curly quotes do not defeat the net or fake a change (dup4)', () => {
  it('a 58-word paragraph with 8 curly apostrophes is recognised against its straight-quote copy', () => {
    expect(CURLY.split(/\s+/).length).toBe(58)
    expect(isNearDuplicate(STRAIGHT, CURLY)).toBe(true)
  })
  it('a re-lock differing only in quote style is UNCHANGED (no false "a change didn\'t apply" stamp)', () => {
    let sc = { components: buildDraftComponentTree(3), current_paragraph_index: 0 }
    sc.components[0].items[0] = { ...sc.components[0].items[0], status: 'confirmed', text: CURLY }
    sc.current_paragraph_index = 1
    const r = done(sc, 'c0', STRAIGHT)                // cross-section into a filled part
    expect(r.outcome).toBe('unchanged')
    expect(r.sc.components[0].items[0].revisionRefused).toBeUndefined()
    expect(r.sc.components[0].items[0].text).toBe(CURLY)
  })
  it('the fragment net also sees through quote style', () => {
    const item = { id: 'c0', status: 'confirmed', text: CURLY }
    const d = decideDoneWrite({ scaffold: { components: [{ type: 'custom', items: [item] }] }, target: { paraIdx: 0, id: 'c0', exact: true }, item, inlineText: "My dad's rule was that you figure it out yourself" })
    expect(d.outcome).toBe('fragment')
  })
})

describe('#5 — STRUCTURE TOO SMALL still works on a starting-draft scaffold', () => {
  it('five one-part draft sections cannot hold a 1,200-word minimum → warned', () => {
    expect(scaffoldTooSmallForMinimum({ type: 'words', min: 1200 }, buildDraftComponentTree(5))).toMatchObject({ sections: 5 })
  })
  it('a haiku-style custom section is still skipped', () => {
    expect(scaffoldTooSmallForMinimum({ type: 'words', min: 1200 }, [{ type: 'custom', items: [{ id: 'c0' }, { id: 'c1' }, { id: 'c2' }] }])).toBeNull()
  })
})

describe('#5/#6 — an id past the end never silently discards the words', () => {
  it('[DONE:c5:…] on a full 5-section draft scaffold is refused AND the incoming words are banked', () => {
    let sc = { components: buildDraftComponentTree(5), current_paragraph_index: 5 }
    sc.components.forEach((s, i) => { s.status = 'complete'; s.items[0] = { ...s.items[0], status: 'confirmed', text: `Paragraph ${i} text that is already here.` } })
    const r = done(sc, 'c5', 'Last month my friend Jaylen\'s chain snapped outside school and I walked him through the fix.')
    expect(r.outcome).toBe('preserved')
    expect(everywhere(r.sc)).toContain('Jaylen')                      // banked, recoverable
  })
  it('draftSectionCount is a real ceiling', () => {
    expect(draftSectionCount(40, 3)).toBeLessThanOrEqual(20)
  })
})

describe('#8 — refusal labels name the paragraph, not a bare id', () => {
  it('a duplicate of a legacy part is labelled "Paragraph 1 (context)"', () => {
    const sc = { components: [
      { type: 'personal_statement', items: [{ id: 'hook', label: 'Hook', status: 'confirmed', text: 'a' }, { id: 'context', label: 'Context', status: 'confirmed', text: PX }] },
      { type: 'personal_statement', items: [{ id: 'hook', label: 'Hook', status: 'working', text: null }] }] }
    expect(findConfirmedDuplicate(sc, 1, 'hook', PX).label).toBe('Paragraph 1 (Context)')
  })
})

describe('the recovery path ("Add them here anyway") survives the coach\'s acknowledgement', () => {
  it('after the student puts banked words in anyway, a bare [DONE:id] is UNCHANGED — not refused again, not stamped', () => {
    let sc = { components: buildDraftComponentTree(3), current_paragraph_index: 1 }
    sc.components[0].items[0] = { ...sc.components[0].items[0], status: 'confirmed', text: PX }
    let r = done(sc, 'c1', PX)
    expect(r.outcome).toBe('duplicate')
    // confirmNugget(paraIdx, id, duplicateOf.text): clearDuplicateStamp + confirm
    sc = updateComponentItem(r.sc, 1, 'c1', it => ({ ...clearDuplicateStamp(it), status: 'confirmed', text: it.duplicateOf.text }))
    r = done(sc, 'c1', '')
    expect(r.outcome).toBe('unchanged')
    expect(r.sc.components[1].items[0].duplicateOf ?? null).toBeNull()
    expect(r.sc.components[1].items[0].text).toBe(PX)
    // and the bank was kept on the trail when the stamp cleared
    expect(r.sc.components[1].items[0].replaced).toContain(PX)
  })
})

describe('the deferred move never resurrects a refused duplicate', () => {
  it('refused re-lock of ¶2 into section 3, then a LIGHT revision of ¶2 in section 2 → section 3 stays empty (banked)', () => {
    let sc = { components: buildDraftComponentTree(4), current_paragraph_index: 1 }
    sc.components[1].items[0] = { ...sc.components[1].items[0], status: 'confirmed', text: PX }
    let r = done(sc, 'c2', PX)
    expect(r.outcome).toBe('duplicate')
    r = done(r.sc, 'c1', PX.replace('make new friends at lunch', 'make new friends at lunch every single time'))
    expect(r.outcome).toBe('written')
    expect(r.sc.components[2].items[0].text ?? null).toBeNull()             // no second copy
    expect(r.sc.components[2].items[0].duplicateOf.text).toBe(PX)            // still banked
    expect(r.sc.components[1].items[0].replaced).toContain(PX)               // and the old version trailed
  })
})
