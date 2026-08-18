import { describe, it, expect } from 'vitest'
import { growComponents, verifyGrowth, reconcileComponentsWrite, growthTypeFor, growthLabelFor, sectionDisplayName, componentDisplayId, MAX_GROWTH } from '@/lib/scaffoldGrowth'

// Synthetic fixtures only (public repo). Shapes mirror TutorSession's buildComponentTree.
const customStory = [{
  index: 0, type: 'custom', status: 'working', summary: null,
  items: [
    { id: 'c0', label: 'Scene 1', status: 'confirmed', text: 'SCENE ONE WORDS', nuggetText: null },
    { id: 'c1', label: 'Scene 2', status: 'confirmed', text: 'SCENE TWO WORDS', nuggetText: null },
  ],
}]
const essay = [
  { index: 0, type: 'introduction', status: 'complete', summary: 's0', items: [{ id: 'hook', label: 'Hook', status: 'confirmed', text: 'HOOK WORDS', nuggetText: null }] },
  { index: 1, type: 'body', status: 'working', summary: null, items: [{ id: 'topic_sentence', label: 'Topic', status: 'locked', text: null, nuggetText: null }] },
]

describe('growComponents — APPEND-ONLY is the whole contract', () => {
  it('appends the requested number of sections', () => {
    const { components, added } = growComponents(customStory, 3)
    expect(added).toBe(3)
    expect(components).toHaveLength(4)
  })

  it('carries every existing section across by IDENTITY (cannot be altered)', () => {
    const { components } = growComponents(customStory, 5)
    expect(components[0]).toBe(customStory[0])          // same object reference
    expect(components[0].items[0].text).toBe('SCENE ONE WORDS')
  })

  it('does not mutate the input array', () => {
    const snapshot = JSON.stringify(customStory)
    growComponents(customStory, 4)
    expect(JSON.stringify(customStory)).toBe(snapshot)
    expect(customStory).toHaveLength(1)
  })

  it('appended sections are EMPTY and locked (never steal the coach focus)', () => {
    const { components } = growComponents(customStory, 2)
    for (const s of components.slice(1)) {
      expect(s.status).toBe('locked')
      expect(s.items.every(it => !it.text && !it.nuggetText)).toBe(true)
    }
  })

  it('custom growth = ONE labelled part per section (the scene-per-section fix)', () => {
    const { components } = growComponents(customStory, 2, { labels: ['Scene 3', 'Scene 4'] })
    expect(components[1].type).toBe('custom')
    expect(components[1].items).toHaveLength(1)
    expect(components[1].items[0].label).toBe('Scene 3')
    expect(components[2].items[0].label).toBe('Scene 4')
  })

  // REGRESSION (red-team 2026-08-16): ids were minted from the SECTION index, so growing
  // Sierra's one-section story (items c0..c9) produced `c1` — Scene 2's id. [DONE:c1:…]
  // takes the local exact match and the exact path lets a revision overwrite confirmed
  // text, so a revision aimed at Scene 2 would have destroyed the grown section's words.
  // "Component ids are unique" is a FALSE premise this repo has already been bitten by.
  it('NEVER mints an item id that collides with an existing one (any section)', () => {
    const tenScenes = [{
      index: 0, type: 'custom', status: 'working', summary: null,
      items: Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`, label: `Scene ${i + 1}`, status: 'confirmed', text: `SCENE ${i + 1} WORDS`, nuggetText: null,
      })),
    }]
    const { components } = growComponents(tenScenes, 3, { labels: ['Scene 11', 'Scene 12', 'Scene 13'] })
    const ids = components.flatMap(s => s.items.map(i => i.id))
    expect(new Set(ids).size).toBe(ids.length)                 // globally unique
    expect(components[1].items[0].id).toBe('c10')              // continues past c9
    expect(components[2].items[0].id).toBe('c11')
    expect(components[3].items[0].id).toBe('c12')
  })

  it('fills a GAP in existing ids without colliding', () => {
    const gapped = [{
      index: 0, type: 'custom', status: 'working', summary: null,
      items: [{ id: 'c0', label: 'A', status: 'confirmed', text: 'X', nuggetText: null },
              { id: 'c2', label: 'B', status: 'confirmed', text: 'Y', nuggetText: null }],
    }]
    const { components } = growComponents(gapped, 2)
    const ids = components.flatMap(s => s.items.map(i => i.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(components[1].items[0].id).toBe('c1')               // reuses the free slot safely
    expect(components[2].items[0].id).toBe('c3')
  })

  it('falls back to a generic part label when none supplied', () => {
    const { components } = growComponents(customStory, 1)
    expect(components[1].items[0].label).toBe('Part 2')
  })

  // ── Sierra's REAL stored shape (P0, 2026-08-17) ──────────────────────────────────
  // section 0: type=narrative, items hook/context/body/closing — the `closing` holding
  // 152 confirmed words. The old rule normalised every non-custom type to `body`, so she
  // tapped "+ Add another section" for scene two and got an ESSAY BODY PARAGRAPH.
  const sierraNarrative = [{
    index: 0, type: 'narrative', status: 'working', summary: null,
    items: [
      { id: 'hook', label: 'Hook', status: 'confirmed', text: 'HER OPENING', nuggetText: null },
      { id: 'context', label: 'Context', status: 'confirmed', text: 'HER SETUP', nuggetText: null },
      { id: 'body', label: 'Body', status: 'confirmed', text: 'HER MIDDLE', nuggetText: null },
      { id: 'closing', label: 'Closing', status: 'confirmed', text: 'HER 152-WORD ENDING', nuggetText: null },
    ],
  }]

  // The flip (Robert's call, 2026-08-17): a narrative grows CUSTOM "Scene N", not another
  // narrative. One labelled part per scene, no ending of its own, and — the win on the
  // ceiling that started all of this — persisted verbatim at completion instead of run
  // through the assembly model.
  it('a NARRATIVE grows into a custom "Scene N" section (Sierra)', () => {
    const { components } = growComponents(sierraNarrative, 1)
    expect(components[1].type).toBe('custom')
    expect(components[1].items).toHaveLength(1)
    expect(components[1].items[0].label).toBe('Scene 2')
    // The regression this replaced: essay slots in a story.
    expect(components[1].items.map(i => i.id)).not.toContain('topic_sentence')
    expect(components[1].items.map(i => i.id)).not.toContain('evidence')
  })

  it('and NO second ending — the whole point of the flip', () => {
    const { components } = growComponents(sierraNarrative, 3)
    for (const s of components.slice(1)) {
      expect(s.items.map(i => i.id)).not.toContain('closing')
    }
    // Exactly one `closing` in the whole scaffold: hers.
    const closings = components.flatMap(s => s.items).filter(i => i.id === 'closing')
    expect(closings).toHaveLength(1)
    expect(closings[0].text).toBe('HER 152-WORD ENDING')
  })

  // Scene labels have to stay consistent across SUCCESSIVE growths. After the first one
  // the last section is `custom`, so a label derived from the LAST type would read
  // "Scene 2" then "Part 3". It is derived from the FIRST section's type instead.
  it('successive growths keep counting scenes, not parts', () => {
    const once = growComponents(sierraNarrative, 1).components
    const twice = growComponents(once, 2).components
    expect(twice.map(s => s.items[0].label)).toEqual(['Hook', 'Scene 2', 'Scene 3', 'Scene 4'])
    expect(twice[2].type).toBe('custom')
    const ids = twice.flatMap(s => s.items.map(i => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a PERSONAL STATEMENT inherits itself too (also not on the essay ladder)', () => {
    const ps = [{ index: 0, type: 'personal_statement', status: 'working', summary: null,
      items: [{ id: 'hook', label: 'Hook', status: 'confirmed', text: 'X', nuggetText: null }] }]
    const { components } = growComponents(ps, 1)
    expect(components[1].type).toBe('personal_statement')
    expect(components[1].items.map(i => i.id)).toEqual(['hook', 'context', 'reflection', 'connection'])
  })

  it('her confirmed 152-word ending is untouched by growth (append-only holds)', () => {
    const { components } = growComponents(sierraNarrative, 2)
    expect(components[0]).toBe(sierraNarrative[0])
    expect(components[0].items[3].text).toBe('HER 152-WORD ENDING')
  })

  // ⚠️ STILL TRUE and deliberately pinned: the flip stops the piece growing MORE endings,
  // but hers is section 0's `closing` and anything appended puts it mid-story. Growth
  // cannot reorder — that would desync paragraph_index from the paragraphs rows keyed on
  // it — so moving those 152 words is a separate, deliberate data move.
  it('KNOWN: her ending stays at section 0, so growth still puts it mid-story', () => {
    const { components } = growComponents(sierraNarrative, 1)
    expect(components[0].items[3].id).toBe('closing')
    expect(components[0].items[3].text).toBe('HER 152-WORD ENDING')
    expect(components).toHaveLength(2)   // appended AFTER it, never before
  })

  // Explicit labels still win over the derived default.
  it('explicit labels override the derived "Scene N"', () => {
    const { components } = growComponents(sierraNarrative, 2, { labels: ['The chase', 'The door'] })
    expect(components[1].items[0].label).toBe('The chase')
    expect(components[2].items[0].label).toBe('The door')
    const ids = components.flatMap(s => s.items.map(i => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Inheriting the LAST section's type appended a SECOND CONCLUSION to any finished
  // essay (its last section IS the conclusion), giving the student echo/thesis_restate/
  // closing slots where they meant another body paragraph. The essay ladder — and ONLY
  // the essay ladder — normalises to body.
  it('prose grows by a BODY paragraph, never a second conclusion', () => {
    const { components } = growComponents(essay, 1)
    expect(components[2].type).toBe('body')
    expect(components[2].items.map(i => i.id)).toEqual(['topic_sentence', 'evidence', 'analysis', 'transition'])

    const finishedEssay = [...essay, { index: 2, type: 'conclusion', status: 'complete', summary: null, items: [] }]
    const grown = growComponents(finishedEssay, 1).components
    expect(grown[3].type).toBe('body')
  })

  it('custom stays custom', () => {
    expect(growComponents(customStory, 1).components[1].type).toBe('custom')
  })

  it('honours an explicit type override', () => {
    const { components } = growComponents(essay, 1, { type: 'conclusion' })
    expect(components[2].items.map(i => i.id)).toEqual(['echo', 'synthesis', 'thesis_restate', 'closing'])
  })

  it('new sections carry sequential indexes continuing from the end', () => {
    const { components } = growComponents(essay, 2)
    expect(components.map(s => s.index)).toEqual([0, 1, 2, 3])
  })

  it('REFUSES a bad count rather than silently doing nothing', () => {
    expect(() => growComponents(customStory, 0)).toThrow(/1\.\.20/)
    expect(() => growComponents(customStory, -1)).toThrow()
    expect(() => growComponents(customStory, 1.5)).toThrow()
    expect(() => growComponents(customStory, MAX_GROWTH + 1)).toThrow()
    expect(() => growComponents(customStory, 'three')).toThrow()
  })

  it('REFUSES to grow a scaffold with no sections (nothing to append to)', () => {
    expect(() => growComponents([], 2)).toThrow(/no sections/)
    expect(() => growComponents(null, 2)).toThrow()
  })
})

describe('verifyGrowth — the post-write assertion', () => {
  it('passes a legitimate growth', () => {
    const { components } = growComponents(customStory, 2)
    expect(verifyGrowth(customStory, components, 2)).toEqual({ ok: true, reason: null })
  })

  it('CATCHES a changed existing section (the loss case)', () => {
    const { components } = growComponents(customStory, 2)
    const tampered = structuredClone(components)
    tampered[0].items[0].text = 'OVERWRITTEN'
    const r = verifyGrowth(customStory, tampered, 2)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/section 0 CHANGED/)
  })

  it('CATCHES a dropped existing section', () => {
    const { components } = growComponents(essay, 1)
    const dropped = components.slice(1)      // lost section 0
    expect(verifyGrowth(essay, dropped, 1).ok).toBe(false)
  })

  it('CATCHES a wrong-sized result (short copy AND over-copy)', () => {
    const { components } = growComponents(customStory, 2)
    expect(verifyGrowth(customStory, components, 3).ok).toBe(false)   // expected more
    expect(verifyGrowth(customStory, components, 1).ok).toBe(false)   // expected fewer
  })

  it('CATCHES an appended section that arrived non-empty', () => {
    const { components } = growComponents(customStory, 1)
    const dirty = structuredClone(components)
    dirty[1].items[0].text = 'SMUGGLED TEXT'
    const r = verifyGrowth(customStory, dirty, 1)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/not empty/)
  })
})

describe('reconcileComponentsWrite — the stale-shrink guard', () => {
  const stored = [{ index: 0, items: [{ id: 'c0', text: 'SCENE 1' }] },
                  { index: 1, items: [{ id: 'c1', text: 'SCENE 2 IN GROWN SECTION' }] }]

  it('a STALE SHORTER array does not delete the grown section (or its work)', () => {
    const staleTab = [stored[0]]                       // tab opened before the growth
    const r = reconcileComponentsWrite(staleTab, stored)
    expect(r.components).toHaveLength(2)
    expect(r.carried).toBe(1)
    expect(r.components[1].items[0].text).toBe('SCENE 2 IN GROWN SECTION')
    expect(r.reason).toMatch(/stale/)
  })

  it('an equal-length array passes through untouched (the normal lock path)', () => {
    const lock = structuredClone(stored)
    lock[0].items[0].text = 'SCENE 1 REVISED'
    const r = reconcileComponentsWrite(lock, stored)
    expect(r.components).toBe(lock)                    // identity — no interference
    expect(r.carried).toBe(0)
    expect(r.reason).toBeNull()
  })

  it('a LONGER array (a fresh growth) passes through untouched', () => {
    const grown = [...stored, { index: 2, items: [{ id: 'c2', text: null }] }]
    expect(reconcileComponentsWrite(grown, stored).carried).toBe(0)
  })

  it('tolerates a missing/degenerate stored array', () => {
    expect(reconcileComponentsWrite(stored, undefined).components).toBe(stored)
    expect(reconcileComponentsWrite(stored, []).components).toBe(stored)
    expect(reconcileComponentsWrite(null, stored).components).toBe(stored)
  })
})

describe('growthTypeFor — three different answers, one per family', () => {
  it('normalises the essay ladder to body (never a second conclusion)', () => {
    expect(growthTypeFor('introduction')).toBe('body')
    expect(growthTypeFor('body')).toBe('body')
    expect(growthTypeFor('conclusion')).toBe('body')
  })
  it('grows a narrative into custom scenes (never a second closing)', () => {
    expect(growthTypeFor('narrative')).toBe('custom')
    expect(growthTypeFor('custom')).toBe('custom')
  })
  it('lets personal_statement inherit itself — its slots carry NO closing', () => {
    expect(growthTypeFor('personal_statement')).toBe('personal_statement')
  })
  it('falls back to body on an unknown or absent type', () => {
    expect(growthTypeFor(undefined)).toBe('body')
    expect(growthTypeFor('something_new')).toBe('body')
  })
})

describe('growthLabelFor — the scene/part default', () => {
  it('counts scenes for a narrative origin', () => {
    expect(growthLabelFor('narrative', 1)).toBe('Scene 2')
    expect(growthLabelFor('narrative', 9)).toBe('Scene 10')
  })
  it('counts parts for anything else, including a scaffold that began custom', () => {
    expect(growthLabelFor('custom', 1)).toBe('Part 2')
    expect(growthLabelFor(undefined, 1)).toBe('Part 2')
  })
})

// ── sectionDisplayName / componentDisplayId ──────────────────────────────────────────
// The bug these close: the STUDENT's screen said "Scene 2" (TutorSession sectionHeading
// reads items[0].label) while the coach's CURRENT SCAFFOLD STATE said "(custom)" and
// "c0". Worse on an uploaded worksheet, where c2 vs c3 is "Star rating" vs "Why you'd
// recommend it" and the coach cannot coach a field it cannot identify.
describe('sectionDisplayName', () => {
  const scene = label => ({ type: 'custom', items: [{ id: 'c0', label }] })

  it('names a one-part custom section by its label', () => {
    expect(sectionDisplayName(scene('Scene 2'))).toBe('Scene 2')
  })

  it('returns null for prose sections, so callers keep the type', () => {
    expect(sectionDisplayName({ type: 'body', items: [{ id: 'hook', label: 'hook' }] })).toBeNull()
    expect(sectionDisplayName({ type: 'narrative', items: [{ id: 'hook', label: 'hook' }] })).toBeNull()
  })

  it('returns null when a custom section holds MORE than one part', () => {
    // A multi-item custom section (a worksheet) has no single name — its parts do.
    expect(sectionDisplayName({ type: 'custom', items: [{ id: 'c0', label: 'Title' }, { id: 'c1', label: 'Author' }] })).toBeNull()
  })

  it('returns null when the label is just the id again', () => {
    expect(sectionDisplayName({ type: 'custom', items: [{ id: 'c0', label: 'c0' }] })).toBeNull()
  })

  it('survives junk without throwing', () => {
    for (const junk of [null, undefined, {}, { type: 'custom' }, { type: 'custom', items: [] }]) {
      expect(sectionDisplayName(junk)).toBeNull()
    }
  })

  it('names every section a real grown story produces', () => {
    const s0 = { index: 0, type: 'narrative', status: 'complete', items: ['hook', 'body'].map(id => ({ id, label: id })) }
    const g = growComponents([s0], 2, { now: 'n' })
    expect(sectionDisplayName(g.components[0])).toBeNull()          // the prose origin
    expect(sectionDisplayName(g.components[1])).toBe('Scene 2')
    expect(sectionDisplayName(g.components[2])).toBe('Scene 3')
  })
})

describe('componentDisplayId', () => {
  it('keeps the id FIRST and exact — it is what [DONE:id:…] must carry', () => {
    expect(componentDisplayId({ id: 'c2', label: 'Star rating out of 5' }))
      .toBe('c2 ("Star rating out of 5")')
  })

  it('is byte-identical to the bare id on prose, where label === id', () => {
    // The prose path is the overwhelming majority of turns; it must not change at all.
    for (const id of ['hook', 'context', 'thesis', 'topic_sentence', 'evidence', 'closing']) {
      expect(componentDisplayId({ id, label: id })).toBe(id)
    }
  })

  it('falls back to the bare id when there is no label', () => {
    expect(componentDisplayId({ id: 'c0' })).toBe('c0')
    expect(componentDisplayId({ id: 'c0', label: null })).toBe('c0')
  })

  it('never returns "undefined" as text for junk', () => {
    expect(componentDisplayId(null)).toBe('')
    expect(componentDisplayId({})).toBe('')
  })
})
