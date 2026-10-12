// lib/startingDraftScaffold.js — the scaffold SHAPE for a session that starts from a draft.
//
// PURE (no React/Next/Supabase, no imports) so the client (TutorSession), the prompt builder
// (lib/prompts.js) and the probes all read ONE definition — a rule expressed twice eventually
// gets expressed differently (see lib/coachTokens.js).
//
// ── Why this exists (simulated eval + repro probe, 2026-10-11) ───────────────────────────
// A prose section has FOUR fixed parts (hook/context/reflection/connection …). The coach was
// told the sections ARE the draft's paragraphs, and read that as one PARAGRAPH per PART:
// "keep my first two paragraphs" put paragraph 1 into section 1's hook and paragraph 2 into
// section 1's context (8/8 samples). When the student then said section 2 was empty, it
// re-locked paragraph 2 into section 2 while it still sat in section 1 — a duplicate (4/4).
// In a three-session simulation that produced a 740-word essay with a 168-word paragraph in
// it twice, and a session that saved paragraph 1 twice and paragraphs 2–5 never.
//
// The fix is to make the model's instinct CORRECT rather than to argue with it: when the
// student arrives with a draft, every section holds ONE part, and that part holds a WHOLE
// paragraph. "Paragraph 1 goes here" is then exactly right.
//
// ── The shape, and why each property was chosen ──────────────────────────────────────────
//  · type 'custom', ONE item per section — the shape narrative growth already ships for
//    "Scene N" (lib/scaffoldGrowth.js). Custom sections persist VERBATIM at completion
//    (persistCustomFinals) and never call the assembly model, so a kept paragraph reaches the
//    Final Draft byte-for-byte and can never hit AssemblyTruncatedError.
//  · item ids c0, c1, c2 … one per SECTION, unique across the whole tree. Unique ids are what
//    let `[DONE:c1:…]` from section 1 resolve to section 2 through resolveComponentWrite's
//    cross-section path (one unambiguous hit) instead of landing locally. They are also what
//    scaffoldGrowth.mintUniqueId will continue from (c{N}) if the student adds a section.
//  · label "Paragraph k" — what the student sees (sectionHeading) and what the coach sees
//    (sectionDisplayName / componentDisplayId), so both read the same document.
//  · `fromStartingDraft: true` — provenance of the SHAPE (nothing branches on it today; it is
//    there so a row implicated in a loss says who built it, like scaffoldGrowth's grownAt).

/** At most this many sections are created from draft paragraphs. A dialogue-heavy story can
 *  have forty one-line "paragraphs"; one section each would bloat every prompt and help no
 *  one. Past this, the coach's own count stands and the student can add sections. */
export const MAX_DRAFT_SECTIONS = 12
/** No starting-draft scaffold is ever built with more sections than this, whatever count the
 *  coach emits (same ceiling growth uses per tap). Round-2 review #6: above 12 paragraphs the
 *  coach's count used to pass through unbounded. */
export const MAX_SCAFFOLD_SECTIONS = 20

/**
 * Split a starting draft into the paragraphs the STUDENT wrote.
 *
 * Blank lines are paragraph breaks. Some editors paste paragraphs separated by a single
 * newline instead; that is only trusted when the lines read as finished sentences, because
 * a hard-wrapped draft (copied out of a PDF at 80 columns) also has single newlines, and
 * splitting it there would hand the coach thirty "paragraphs" that end mid-sentence.
 * A draft with no breaks at all is ONE paragraph — the only real starting-draft session so
 * far was exactly that — and the prompt handles it as a block to be split by agreement.
 */
export function splitDraftParagraphs(content) {
  const text = String(content ?? '').replace(/\r\n?/g, '\n').trim()
  if (!text) return []
  const byBlank = text.split(/\n[ \t]*\n+/).map(s => s.trim()).filter(Boolean)
  if (byBlank.length > 1) return byBlank
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean)
  if (lines.length < 2) return byBlank
  const ended = lines.slice(0, -1).filter(l => /[.!?]["”’')\]]*$/.test(l)).length
  return ended / (lines.length - 1) >= 0.8 ? lines : byBlank
}

const PROSE_TYPES = new Set(['essay', 'narrative', 'personal_statement', 'introduction', 'body', 'conclusion'])

/**
 * Should a [SCAFFOLD:type:count] build the one-paragraph-per-section shape?
 *
 * Only for PROSE types with a starting draft present. A custom labelled scaffold
 * ([SCAFFOLD:custom:1:Line 1|Line 2|…]) is the coach choosing a non-prose form — a poem's
 * lines are not paragraphs — so it is left exactly as the coach asked.
 */
export function shouldUseDraftShape(assignType, startingDraftContent) {
  if (!PROSE_TYPES.has(String(assignType ?? ''))) return false
  return splitDraftParagraphs(startingDraftContent).length > 0
}

/**
 * How many sections to build: the coach's count, raised to fit every draft paragraph.
 *
 * The coach is told to set up one section per paragraph plus room for the word target. If it
 * under-counts, paragraph 5 would have no section to go in and the student would have to tap
 * "+ Add another section" before their own draft fits — so the count is raised, never
 * lowered. Capped at MAX_DRAFT_SECTIONS (see above).
 */
export function draftSectionCount(coachCount, draftParagraphCount) {
  const coach = Number.isFinite(Number(coachCount)) && Number(coachCount) > 0 ? Math.floor(Number(coachCount)) : 1
  const paras = Math.max(0, Math.floor(Number(draftParagraphCount) || 0))
  // Past MAX_DRAFT_SECTIONS short paragraphs (dialogue) the coach's own count stands — the
  // prompt then tells it consecutive short paragraphs may share a section.
  const raised = paras > MAX_DRAFT_SECTIONS ? coach : Math.max(coach, paras)
  return Math.min(raised, MAX_SCAFFOLD_SECTIONS)
}

/**
 * The component tree: `count` sections, each ONE part holding a whole paragraph.
 *
 * Mirrors buildComponentTree's output contract in TutorSession (index/type/status/summary/
 * items; first section and its part 'working', the rest 'locked').
 */
export function buildDraftComponentTree(count) {
  const n = Math.max(1, Math.floor(Number(count) || 1))
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    type: 'custom',
    status: i === 0 ? 'working' : 'locked',
    summary: null,
    items: [{ id: `c${i}`, label: `Paragraph ${i + 1}`, status: i === 0 ? 'working' : 'locked', text: null, nuggetText: null }],
    fromStartingDraft: true,
  }))
}

/**
 * Decide the tree for a [SCAFFOLD:type:count] token. Returns null when the normal builder
 * should run (no draft, a non-prose form, or a single section — with one section there is
 * no "which section does paragraph 2 go in" for the model to get wrong, and a single custom
 * section's "Lock in all parts" button would end the whole assignment on one tap).
 */
export function draftScaffoldTree(assignType, coachCount, startingDraftContent) {
  if (!shouldUseDraftShape(assignType, startingDraftContent)) return null
  const count = draftSectionCount(coachCount, splitDraftParagraphs(startingDraftContent).length)
  if (count < 2) return null
  return buildDraftComponentTree(count)
}

/** Is this stored scaffold the one-paragraph-per-section shape? Structural, so it holds for
 *  a scaffold built before `fromStartingDraft` existed and after growth appends sections. */
export function isDraftShapedScaffold(scaffold) {
  const sections = Array.isArray(scaffold?.components) ? scaffold.components : []
  return sections.length > 1 && sections.every(s => s?.type === 'custom' && (s.items?.length ?? 0) === 1)
}
