import { describe, it, expect } from 'vitest'
import { buildCoachSystemBlocks } from './prompts.js'

// Gate 1 ($0) for the CONTINUATION signal and the out-of-range-cursor rendering.
// These assert on the TEXT the model is actually handed — the harness probe
// (scripts/prompt-harness/continuation.mjs) then proves the model ACTS on it.
// A rule can be in the file and never fire; only the probe catches that.

const ASSIGNMENT = 'Persuasive essay: should recess be longer? 300–400 words.'

const para = (type, ids, summary) => ({
  type,
  status: 'complete',
  summary,
  items: ids.map(id => ({ id, status: 'confirmed', text: `confirmed ${id} text` })),
})

// The exact shape a "Keep working" v2 opens with: v1's finished scaffold copied
// verbatim, INCLUDING its parked cursor (lib/sessionContinuation.js copies
// current_paragraph_index as-is, and v1 leaves it clamped at components.length).
const finishedScaffold = () => ({
  assignment_type: 'essay',
  total_paragraphs: 3,
  current_paragraph_index: 3,
  thesis: 'Recess should be longer.',
  components: [
    para('intro', ['hook', 'context', 'thesis'], 'introduces the argument'),
    para('body', ['topic_sentence', 'evidence', 'analysis'], 'kids focus better after moving'),
    para('conclusion', ['restate', 'closing'], 'wraps it up'),
  ],
})

const midScaffold = () => ({
  assignment_type: 'essay',
  total_paragraphs: 3,
  current_paragraph_index: 1,
  thesis: 'Recess should be longer.',
  components: [
    para('intro', ['hook', 'context', 'thesis'], 'introduces the argument'),
    { type: 'body', status: 'active', items: [{ id: 'topic_sentence', status: 'working' }, { id: 'evidence', status: 'locked' }] },
    { type: 'conclusion', status: 'pending', items: [{ id: 'restate', status: 'locked' }] },
  ],
})

const tail = (scaffold, opts = {}) =>
  buildCoachSystemBlocks('owen', ASSIGNMENT, scaffold, opts).dynamicTail

describe('scaffold state — cursor parked past the last paragraph', () => {
  // The bug this locks down: components[3] is undefined on an all-done scaffold, so
  // the component list came out empty and the tail printed "(no components yet — emit
  // [SCAFFOLD:type:count] to initialize)" — the prompt telling the coach to emit the
  // one token that erases every locked paragraph.
  it('never tells the coach to emit [SCAFFOLD] when a scaffold already exists', () => {
    const t = tail(finishedScaffold())
    expect(t).not.toMatch(/emit \[SCAFFOLD/)
  })

  it('warns off [SCAFFOLD] explicitly when a section genuinely lists no items', () => {
    // Sections exist but this one is empty — the old fallback text ("emit
    // [SCAFFOLD:type:count] to initialize") would have been an erase instruction.
    const sc = finishedScaffold()
    sc.components[2].items = []
    const t = tail(sc)
    expect(t).not.toMatch(/emit \[SCAFFOLD:type:count\]/)
    expect(t).toContain('do NOT emit [SCAFFOLD]')
  })

  it('does not claim a paragraph beyond the total', () => {
    const t = tail(finishedScaffold())
    expect(t).not.toContain('paragraph 4 of 3')
    expect(t).toContain('all 3 paragraphs are already marked done')
  })

  it('reads correctly for a single-paragraph piece too', () => {
    const t = tail({
      assignment_type: 'paragraph',
      total_paragraphs: 1,
      current_paragraph_index: 1,
      components: [para('body', ['topic_sentence', 'closing'], 'the whole piece')],
    })
    expect(t).toContain('the single paragraph is already marked done')
    expect(t).not.toMatch(/emit \[SCAFFOLD/)
  })

  it('reports the last paragraph\'s real components instead of an empty list', () => {
    const t = tail(finishedScaffold())
    expect(t).toContain('Components of the LAST paragraph (2 of 2 confirmed)')
    expect(t).toContain('restate: confirmed')
    expect(t).toContain('closing: confirmed')
  })

  it('does not say "ready for assembly" for work already assembled', () => {
    const t = tail(finishedScaffold())
    expect(t).not.toContain('ready for assembly')
    expect(t).toContain('already assembled into the Draft')
  })

  it('still instructs [SCAFFOLD] when there is genuinely no structure yet', () => {
    const t = tail({ assignment_type: 'essay', total_paragraphs: 3, current_paragraph_index: 0, components: [] })
    expect(t).toContain('emit [SCAFFOLD:type:count]')
  })

  it('leaves an ordinary mid-essay session byte-identical', () => {
    // The whole point of clamping is that it is a no-op unless the cursor ran past
    // the end. Nothing about an in-range cursor may change.
    const t = tail(midScaffold())
    expect(t).toContain('Working on: paragraph 2 of 3 (body)')
    expect(t).toContain('Components for current paragraph (0 of 2 confirmed)')
    expect(t).toContain('Currently coaching: topic_sentence')
    expect(t).toContain('Next up: evidence')
  })
})

describe('continuation block (opts.continuation)', () => {
  it('is absent by default — costs nothing on a normal session', () => {
    expect(tail(midScaffold())).not.toContain('CONTINUING A FINISHED DRAFT')
    expect(tail(finishedScaffold())).not.toContain('CONTINUING A FINISHED DRAFT')
  })

  it('appears when the route flags a continuation', () => {
    const t = tail(finishedScaffold(), { continuation: true })
    expect(t).toContain('CONTINUING A FINISHED DRAFT')
    expect(t).toMatch(/Do NOT emit \[COMPLETE\] because every component reads confirmed/)
    expect(t).toContain('Do NOT emit [SCAFFOLD]')
    expect(t).toContain('WHEN [COMPLETE] IS ALLOWED AGAIN')
  })

  it('rides EVERY turn, not just the first (unlike resume)', () => {
    // The all-complete scaffold state persists for the whole v2 session, so the
    // misread it prevents persists too. No first-turn gating anywhere in the builder.
    for (const resume of [true, false]) {
      expect(tail(finishedScaffold(), { continuation: true, resume })).toContain('CONTINUING A FINISHED DRAFT')
    }
  })

  it('fires even when v1 had no scaffold to carry (paragraphs-only session)', () => {
    // buildContinuationScaffold returns null in that case, so the block must not be
    // nested inside the scaffold branch.
    expect(tail(null, { continuation: true })).toContain('CONTINUING A FINISHED DRAFT')
  })

  it('stays in the DYNAMIC tail — never the cached static prefix', () => {
    const { staticPrefix, dynamicTail } = buildCoachSystemBlocks('owen', ASSIGNMENT, finishedScaffold(), { continuation: true })
    expect(staticPrefix).not.toContain('CONTINUING A FINISHED DRAFT')
    expect(dynamicTail).toContain('CONTINUING A FINISHED DRAFT')
  })

  it('does not forbid [COMPLETE] outright — it must stay reachable', () => {
    const t = tail(finishedScaffold(), { continuation: true })
    expect(t).toMatch(/only once they have ACTUALLY done more in THIS session/)
  })
})
