import { describe, it, expect } from 'vitest'
import { COACH_RULES_VERSION, buildCoachSystemBlocks } from './prompts.js'

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

// COACH_RULES_VERSION is stamped onto every session at creation (app/api/sessions)
// so an audit finding can be triaged against the rules that were live when the
// session RAN. Its value is meaningless on its own — what must hold is that it is a
// stable, content-derived identifier of the SHARED rules, and that it does NOT move
// for reasons unrelated to those rules (a persona switch must not look like a rules
// change, or every switched session reads as "ran on different rules").
describe('COACH_RULES_VERSION', () => {
  it('is a 12-char lowercase hex digest', () => {
    expect(COACH_RULES_VERSION).toMatch(/^[0-9a-f]{12}$/)
  })

  it('is stable across reads (deterministic, not per-call)', () => {
    expect(COACH_RULES_VERSION).toBe(COACH_RULES_VERSION)
  })

  it('is derived from real rule content, not an empty/placeholder hash', () => {
    // sha256('') -> e3b0c44298fc... — catches the case where the rule getters
    // silently return empty and the stamp becomes a constant that means nothing.
    expect(COACH_RULES_VERSION).not.toBe('e3b0c44298fc')
  })

  it('does NOT vary by persona — a persona switch is not a rules change', () => {
    // The prompt itself differs per persona (guard against the inverse mistake:
    // hashing the whole prefix, which would make every switch look like new rules).
    const a = buildCoachSystemBlocks('owen', 'Write a paragraph.', null, {})
    const b = buildCoachSystemBlocks('jade', 'Write a paragraph.', null, {})
    expect(a.staticPrefix).not.toBe(b.staticPrefix)
    // ...while the stamp stays put.
    expect(COACH_RULES_VERSION).toMatch(/^[0-9a-f]{12}$/)
  })

  it('the shared rules it hashes are actually present in every persona prefix', () => {
    // If the guardrail/structural blocks stopped being injected, the stamp would
    // still be a valid hash of text nobody sees — a silently meaningless signal.
    for (const persona of ['owen', 'deon', 'zoe', 'alistair', 'matilda', 'jade']) {
      const { staticPrefix } = buildCoachSystemBlocks(persona, 'Write a paragraph.', null, {})
      expect(staticPrefix).toContain('CORE GUARDRAILS')
      expect(staticPrefix).toContain('SAFETY — BIGGER THAN THE ESSAY')
    }
  })
})

// ── Lock by reference (SPEC-lock-by-reference.md) ─────────────────────────────────────
// 🔴 The gate is the safety property, not a nicety. A prompt that emits the anchored form
// against a client that cannot resolve it hands resolveDoneText the anchor string — the
// student's passage replaced by the quotation marks around it. The lanes land TOGETHER;
// until focus/coaching-session wires lib/lockByReference.js, this stays off.
describe('lockByReference rollout flag', () => {
  const ASG = 'Write a story in scenes.'

  it('is ABSENT by default — production behaviour is unchanged', () => {
    expect(tail(null)).not.toContain('LOCKING BY REFERENCE')
    expect(tail(midScaffold())).not.toContain('LOCKING BY REFERENCE')
  })

  it('an explicit false is byte-identical to omitting it', () => {
    expect(buildCoachSystemBlocks('owen', ASG, midScaffold(), { lockByReference: false }).dynamicTail)
      .toBe(buildCoachSystemBlocks('owen', ASG, midScaffold(), {}).dynamicTail)
  })

  it('appears when the flag is on', () => {
    expect(tail(midScaffold(), { lockByReference: true })).toContain('LOCKING BY REFERENCE')
  })

  it('stays in the DYNAMIC tail — flipping a rollout flag must not bust the prompt cache', () => {
    const on = buildCoachSystemBlocks('owen', ASG, midScaffold(), { lockByReference: true })
    const off = buildCoachSystemBlocks('owen', ASG, midScaffold(), {})
    expect(on.staticPrefix).not.toContain('LOCKING BY REFERENCE')
    expect(on.staticPrefix).toBe(off.staticPrefix)
  })

  it('teaches BOTH forms, in the canonical shapes lib/lockByReference.js parses', () => {
    const t = tail(midScaffold(), { lockByReference: true })
    expect(t).toContain('[DONE:id]')
    expect(t).toMatch(/\[DONE:id:"first few words"…"last few words"\]/)
  })

  it('keeps the legacy inline form as the documented fallback', () => {
    // Old sessions carry inline payloads forever, and a correct old-style lock beats a
    // broken new-style one (spec, Rollout 5).
    expect(tail(midScaffold(), { lockByReference: true })).toContain('[DONE:id:their exact words]')
  })

  it('states the anchor rules that make a refusal correct', () => {
    const t = tail(midScaffold(), { lockByReference: true })
    expect(t).toMatch(/appear ONCE/)
    expect(t).toMatch(/SAME message/)
    expect(t).toMatch(/EXACTLY as the student wrote them/)
  })

  it('forbids narrating the plumbing', () => {
    expect(tail(midScaffold(), { lockByReference: true })).toMatch(/NEVER NARRATE/)
  })

  it('does not relax any rule about WHEN a lock is earned', () => {
    const t = tail(midScaffold(), { lockByReference: true })
    expect(t).toMatch(/review pass \(Rule 17\)/)
    expect(t).toMatch(/one-section-per-turn/)
  })
})

// ── 2026-10-11 — the starting draft reaches the coach ─────────────────────────────
// Synthetic draft text (public repo).
const DRAFT = 'The first time I walked into the new school I counted the doors.\n\nThere were eleven of them between the office and my locker.'

describe('starting draft (opts.startingDraft)', () => {
  const blocks = opts => buildCoachSystemBlocks('owen', ASSIGNMENT, null, opts)

  it('present → the text and the instructions ride the dynamic tail', () => {
    const { dynamicTail } = blocks({ startingDraft: { state: 'present', content: DRAFT, wordCount: 24 } })
    expect(dynamicTail).toContain(DRAFT)            // verbatim, paragraph break intact
    expect(dynamicTail).toContain('<<<STARTING DRAFT')
    expect(dynamicTail).toContain('STARTING DRAFT>>>')
    expect(dynamicTail).toMatch(/NEVER ASK FOR IT AGAIN/)
    expect(dynamicTail).toMatch(/24 words/)
  })

  it('NEVER enters the cached static prefix — the prefix is byte-identical with or without it', () => {
    const without = blocks({}).staticPrefix
    const withIt = blocks({ startingDraft: { state: 'present', content: DRAFT, wordCount: 24 } }).staticPrefix
    expect(withIt).toBe(without)
    expect(withIt).not.toContain(DRAFT)
  })

  it('tells the coach the draft is NOT yet in the Draft panel and does not count toward the target', () => {
    const t = blocks({ startingDraft: { state: 'present', content: DRAFT, wordCount: 24 } }).dynamicTail
    expect(t).toMatch(/IT IS NOT IN THEIR DRAFT PANEL YET/)
    expect(t).toMatch(/never tell the student they are\s+"already at 24"/)
  })

  it('locks draft words verbatim, inline — never anchored, never polished', () => {
    const t = blocks({ startingDraft: { state: 'present', content: DRAFT, wordCount: 24 } }).dynamicTail
    expect(t).toMatch(/the whole paragraph, verbatim/)
    expect(t).toMatch(/never paraphrase,\s+reorder, drop or polish/)
    expect(t).toMatch(/full inline form/)
  })

  // ── 2026-10-11 (later) — one whole-paragraph part per section ─────────────────────
  // The client builds this shape for a starting-draft session (lib/startingDraftScaffold.js);
  // the prompt must describe EXACTLY it, or "paragraph 2 goes in section 2" aims at an id
  // that does not exist.
  it('before any scaffold: describes the one-part-per-section shape and its ids', () => {
    const t = blocks({ startingDraft: { state: 'present', content: DRAFT, wordCount: 24 } }).dynamicTail
    expect(t).toMatch(/ONE SECTION HOLDS ONE WHOLE PARAGRAPH/)
    expect(t).toMatch(/Section 1's part is c0, section 2's is c1/)
    // round-2 #5: never invite extrapolating an id past the last section
    expect(t).toMatch(/Use ONLY\s+the ids CURRENT SCAFFOLD STATE shows/)
    expect(t).not.toMatch(/and so on/)
    expect(t).toMatch(/never\s+two paragraphs in one section/)
    expect(t).toMatch(/Their draft has 2 paragraphs: 1 starts "The first time I walked into…"/)
    // the kept-several case may batch, because every id is fixed and visible
    expect(t).toMatch(/Rule 25's one-section-per-turn limit does not apply to kept draft paragraphs/)
    // partial keep: locking finishes the section (Net A advances), so lock the WHOLE paragraph once
    expect(t).toMatch(/locking it finishes that section/)
    expect(t).toMatch(/never the kept part\s+alone first/)
    expect(t).toMatch(/never custom for a prose\s+draft/)
  })

  it('a draft with NO paragraph breaks is named as one block, split by agreement', () => {
    const t = blocks({ startingDraft: { state: 'present', content: 'One long block. With sentences. And no breaks at all here.', wordCount: 11 } }).dynamicTail
    expect(t).toMatch(/NO paragraph breaks — it is one block of 11 words/)
    expect(t).toMatch(/ask where they would break it into paragraphs/)
  })

  it('a LEGACY four-part scaffold keeps the run-of-sentences guidance, never the c0/c1 ids', () => {
    const legacy = {
      assignment_type: 'personal_statement', total_paragraphs: 2, current_paragraph_index: 0,
      components: [0, 1].map(i => ({ index: i, type: 'personal_statement', status: i ? 'locked' : 'working',
        items: ['hook', 'context', 'reflection', 'connection'].map(id => ({ id, status: 'locked', text: null })) })),
    }
    const t = buildCoachSystemBlocks('owen', ASSIGNMENT, legacy, { startingDraft: { state: 'present', content: DRAFT, wordCount: 24 } }).dynamicTail
    expect(t).not.toMatch(/Section 1's part is c0/)
    expect(t).toMatch(/Put ONE draft paragraph in each section/)
    expect(t).toContain('[DONE:id:their exact words]')
    expect(t).toMatch(/one-section-per-turn \(Rule 25\)/)
  })

  it('a draft-shaped scaffold: state shows each section\'s part id, what it holds, and a refused duplicate', () => {
    const sc = {
      assignment_type: 'personal_statement', total_paragraphs: 3, current_paragraph_index: 1,
      components: [
        { index: 0, type: 'custom', status: 'complete', summary: null, items: [{ id: 'c0', label: 'Paragraph 1', status: 'confirmed', text: 'The first time I walked into the new school I counted the doors.' }] },
        { index: 1, type: 'custom', status: 'working', summary: null, items: [{ id: 'c1', label: 'Paragraph 2', status: 'working', text: null, duplicateOf: { paraIdx: 0, id: 'c0', label: 'Paragraph 1' } }] },
        { index: 2, type: 'custom', status: 'locked', summary: null, items: [{ id: 'c2', label: 'Paragraph 3', status: 'locked', text: null }] },
      ],
    }
    const t = buildCoachSystemBlocks('owen', ASSIGNMENT, sc, { startingDraft: { state: 'present', content: DRAFT, wordCount: 24 } }).dynamicTail
    expect(t).toMatch(/Para 1 \(Paragraph 1 — part c0\): ✓ done — complete — its confirmed text starts "The first time I walked into the new…"/)
    expect(t).toMatch(/Para 3 \(Paragraph 3 — part c2\): not started yet \(no content\)/)
    expect(t).toMatch(/REFUSED and is NOT in this section: those words are already in Paragraph 1/)
    expect(t).toMatch(/ONE SECTION HOLDS ONE WHOLE PARAGRAPH/)   // structural detection, not a flag
  })

  it('multi-part sections show what each part holds WITHOUT ids (ids invited cross-section revisions — round 2)', () => {
    const sc = { assignment_type: 'narrative', total_paragraphs: 2, current_paragraph_index: 1, components: [
      { type: 'narrative', status: 'complete', items: [{ id: 'hook', status: 'confirmed', text: 'An oak tree stood alone on the hill.' }, { id: 'closing', status: 'confirmed', text: 'Four acorns would not last the week.' }] },
      { type: 'custom', status: 'working', items: [{ id: 'c0', label: 'Scene 2', status: 'working', text: null }] }] }
    const t = buildCoachSystemBlocks('owen', ASSIGNMENT, sc, {}).dynamicTail
    expect(t).toMatch(/Para 1 \(narrative\): ✓ done — complete — holds "An oak tree stood alone on the hill\." then "Four acorns would not last the week\."/)
    expect(t).not.toMatch(/closing "Four acorns/)
  })

  it('more than MAX_DRAFT_SECTIONS short paragraphs: the shape item allows sharing, never contradicting itself (round-2 #6)', () => {
    const many = Array.from({ length: 15 }, (_, i) => `"Line ${i}."`).join('\n\n')
    const t = blocks({ startingDraft: { state: 'present', content: many, wordCount: 30 } }).dynamicTail
    expect(t).toMatch(/EACH SECTION HOLDS WHOLE PARAGRAPHS/)
    expect(t).toMatch(/Consecutive short paragraphs may share a section/)
    expect(t).not.toMatch(/never two paragraphs in one section/)
  })

  it('Rule 26 (draft looks wrong) is in the cached prefix and quotes no example phrases', () => {
    const p = blocks({}).staticPrefix
    const m = p.match(/26\. WHEN THE STUDENT SAYS THEIR DRAFT LOOKS WRONG[\s\S]*?(?=\n\n[A-Z]|\n\nCOMPONENT)/)
    expect(m).toBeTruthy()
    // Measured lesson: a quoted phrase in the prompt gets copied by the model, and quoting a
    // banned phrase can raise it. The rule names categories, never wording to say or avoid.
    expect(m[0]).not.toMatch(/["“][^"”]{3,}["”]/)
    expect(m[0]).toMatch(/Never put it down to the app/)
    expect(m[0]).toMatch(/another document, another app, a parent, a teacher/)
    // round-2 #9: student safety outranks it, explicitly
    expect(m[0]).toMatch(/None of this limits Rules 16 and 18/)
  })

  it('unknown → says it does not know; never carries text, never claims there is none', () => {
    const t = blocks({ startingDraft: { state: 'unknown' } }).dynamicTail
    expect(t).toMatch(/STARTING DRAFT — UNKNOWN THIS TURN/)
    expect(t).toMatch(/Never tell them they have no\s+draft/)
    expect(t).not.toContain('<<<STARTING DRAFT')
  })

  it('absent / no-table / omitted → byte-identical tail, costs nothing', () => {
    const base = blocks({}).dynamicTail
    expect(blocks({ startingDraft: { state: 'absent' } }).dynamicTail).toBe(base)
    expect(blocks({ startingDraft: { state: 'no-table' } }).dynamicTail).toBe(base)
    // present but empty content is not a draft
    expect(blocks({ startingDraft: { state: 'present', content: '   ' } }).dynamicTail).toBe(base)
  })

  it('falls back to counting the text when word_count is missing or a string', () => {
    expect(blocks({ startingDraft: { state: 'present', content: DRAFT } }).dynamicTail).toMatch(/24 words/)
    expect(blocks({ startingDraft: { state: 'present', content: DRAFT, wordCount: '24' } }).dynamicTail).toMatch(/24 words/)
  })
})

// ── 2026-10-11 — a stated minimum binds; the count is live; the scaffold is sized ──
describe('ASSIGNMENT REQUIREMENTS — minimum vs recommended range', () => {
  const RANGE = { type: 'words', min: 350, max: 500 }
  const req = (words, targets = [RANGE]) => ({ targets, actual: { words, paragraphs: 0 } })
  const oneSection = {
    assignment_type: 'personal_statement', total_paragraphs: 1, current_paragraph_index: 1,
    components: [para('personal_statement', ['hook', 'context', 'reflection', 'connection'], 'moving schools')],
  }

  it('names the minimum as a REQUIREMENT and the range as aspirational, separately', () => {
    const t = tail(null, { requirements: req(0) })
    expect(t).toMatch(/MINIMUM: 350 words — a REQUIREMENT/)
    expect(t).toMatch(/RECOMMENDED TARGET: 440–470 words/)
    expect(t).toMatch(/Aspirational: a nudge, never a gate/)
  })

  it('below the minimum: states the exact shortfall and forbids done / [COMPLETE]', () => {
    const t = tail(oneSection, { requirements: req(177) })
    expect(t).toMatch(/177 words in the Draft right now/)
    expect(t).toMatch(/173 words SHORT of the 350-word minimum: NOT finished/)
    expect(t).toMatch(/do not emit \[COMPLETE\]/)
    expect(t).not.toMatch(/≈/)           // no "approximately" — this is a count, not an estimate
  })

  it('at or above the minimum: says it is met, and does not block', () => {
    const t = tail(oneSection, { requirements: req(360) })
    expect(t).toMatch(/the 350-word minimum is met/)
    expect(t).not.toMatch(/SHORT of/)
    expect(t).not.toMatch(/Only exception/)
  })

  // 2026-10-11 product rule: a student may end below the minimum, but only by saying so explicitly.
  it('below the minimum: names the student-only exception, and forbids raising it', () => {
    const t = tail(oneSection, { requirements: req(177) })
    expect(t).toMatch(/Only exception \(Rule 12 ②\): the student THEMSELVES explicitly asks to finish it as it is/)
    expect(t).toMatch(/if not, state it and ask once/)
    expect(t).toMatch(/Never raise it for them/)
  })

  it('a continuation below the minimum defers to Rule 12, exception included', () => {
    const t = tail(oneSection, { requirements: req(177), continuation: true })
    expect(t).toMatch(/Rule 12 decides it, exactly as written there/)
    expect(t).toMatch(/unless they then explicitly choose to\s+finish it short as it is/)
    expect(t).toMatch(/Never offer that choice/)
  })

  it('over the maximum is flagged', () => {
    expect(tail(oneSection, { requirements: req(540) })).toMatch(/40 words OVER the 500-word limit/)
  })

  it('a ceiling-only target has NO minimum line — the range stays a nudge', () => {
    const t = tail(null, { requirements: req(100, [{ type: 'words', max: 500 }]) })
    expect(t).not.toMatch(/MINIMUM/)
    expect(t).not.toMatch(/SHORT of/)
    expect(t).toMatch(/RECOMMENDED TARGET: 400–450/)
  })

  it('an exact count binds at the stated number', () => {
    const t = tail(oneSection, { requirements: req(240, [{ type: 'words', min: 250, max: 250 }]) })
    expect(t).toMatch(/250 words \(an exact count\)/)
    expect(t).toMatch(/10 words SHORT of the 250-word minimum/)
  })

  it('an unreadable count says UNKNOWN — never a stale or zero number, never "met"', () => {
    const t = tail(oneSection, { requirements: { targets: [RANGE], actual: null }, wordCountUnavailable: true })
    expect(t).toMatch(/UNKNOWN this turn/)
    expect(t).not.toMatch(/the 350-word minimum is met/)
    expect(t).not.toMatch(/0 words in the Draft/)
    // An unreadable count must not open the gate: no [COMPLETE] on a turn that can't check.
    expect(t).toMatch(/if a MINIMUM is stated do not emit \[COMPLETE\] this turn/)
  })

  it('before the scaffold: tells the coach how many sections the target takes', () => {
    expect(tail(null, { requirements: req(0) })).toMatch(/takes about 4 sections/)
  })

  it('after a too-small scaffold: warns, and names the button (no phantom sections)', () => {
    const t = tail(oneSection, { requirements: req(177) })
    expect(t).toMatch(/STRUCTURE TOO SMALL: the scaffold has 1 section/)
    expect(t).toContain('"+ Add another section"')
  })

  it('stays quiet about structure once it can hold the minimum', () => {
    const four = { ...oneSection, total_paragraphs: 4, components: [1, 2, 3, 4].map(() => oneSection.components[0]) }
    const t = tail(four, { requirements: req(177) })
    expect(t).not.toMatch(/STRUCTURE TOO SMALL/)
    expect(t).not.toMatch(/takes about/)
  })

  it('the requirements block stays in the dynamic tail', () => {
    const { staticPrefix } = buildCoachSystemBlocks('owen', ASSIGNMENT, oneSection, { requirements: req(177) })
    expect(staticPrefix).not.toMatch(/173 words SHORT/)
  })
})

describe('static rules — the minimum gate and grounded structure exist in every persona', () => {
  for (const p of ['owen', 'deon', 'zoe', 'alistair', 'matilda', 'jade']) {
    it(`${p}: Rule 12 gate, Rule 14 app-count, Rule 20 no phantom sections, Rule 2 sizing`, () => {
      const { staticPrefix } = buildCoachSystemBlocks(p, ASSIGNMENT, null, {})
      expect(staticPrefix).toMatch(/A STATED MINIMUM IS A REQUIREMENT/)
      expect(staticPrefix).toMatch(/NEVER emit \[COMPLETE\] in that response/)
      expect(staticPrefix).toMatch(/THE COUNT IS THE APP'S, NEVER YOURS/)
      expect(staticPrefix).toMatch(/NEVER PROMISE STRUCTURE THAT DOESN'T EXIST/)
      expect(staticPrefix).toMatch(/SIZE THE STRUCTURE TO THE WORD TARGET/)
      // Rule 14a's "nudge, never a gate" is now explicitly scoped to above-minimum.
      expect(staticPrefix).toMatch(/BUT AT OR ABOVE ANY STATED MINIMUM: it is a nudge, never a gate/)
      // 2026-10-11: ending short is the STUDENT's to raise — explicitly; pausing is not finishing.
      expect(staticPrefix).toMatch(/NEVER OFFER TO END IT SHORT/)
      expect(staticPrefix).toMatch(/The pause is the ONLY exit you ever mention/)
      expect(staticPrefix).toMatch(/PAUSING IS NOT FINISHING/)
      expect(staticPrefix).toMatch(/THE ONE EXCEPTION — THE STUDENT'S OWN EXPLICIT CHOICE TO FINISH IT SHORT/)
      expect(staticPrefix).toMatch(/A "yes" to a finishing question YOU raised unprompted is not a choice/)
      expect(staticPrefix).toMatch(/When unsure between ② and ③, it is ③/)
      // The sentence that drove the leak: on the pre-change prompt it surfaced as "handing it in
      // as is is your call" after 10 of 48 ambiguous replies (min-binding.mjs header). Never again.
      expect(staticPrefix).not.toMatch(/Handing it in short is their decision to make/)
    })
  }
})
