// lib/scaffoldGrowth.js — grow a scaffold by APPENDING empty sections.
//
// PURE (no React/Next/Supabase) so the exact logic the grow endpoint runs is unit-tested —
// same pattern as lib/scaffoldWrite.js, whose header lists the six separate drop paths that
// destroyed student writing. This module is deliberately the narrowest possible operation.
//
// ── Why this exists (Sierra, 2026-08-16) ─────────────────────────────────────────────
// A ten-scene story was scaffolded as ONE section. `[SCAFFOLD:…]` fires once and the
// structure is fixed for the life of the session, so every scene had to fit that single
// container: the section's assembly payload grew until it hit the model ceiling
// (AssemblyTruncatedError), and there was no path to more room. ~1,200 confirmed words and
// 30k characters of story, with nowhere to put the next scene.
//
// ── The one invariant ────────────────────────────────────────────────────────────────
// GROWTH IS APPEND-ONLY. Existing sections are carried across by IDENTITY (the same object
// references, in the same order) and never rebuilt, re-indexed, or re-typed. The only way
// this function can change section N<original length is if JavaScript slice semantics
// change. That is deliberate: the caller cannot express "grow AND edit" through this API,
// so a grown write cannot smuggle a mutation of already-written work. The endpoint proves
// the property again after the write by comparing the stored prefix byte-for-byte.
//
// It is also why growth does NOT take a components array from the client: the client sends
// only a COUNT, the server appends to what is stored. There is no wire format in which a
// caller could hand us an altered section.

// Item shapes, mirrored from TutorSession's getParaItems so a grown section is
// indistinguishable from one the original scaffold built.
const PROSE_ITEMS = {
  introduction:       ['hook', 'context', 'thesis', 'roadmap'],
  body:               ['topic_sentence', 'evidence', 'analysis', 'transition'],
  conclusion:         ['echo', 'synthesis', 'thesis_restate', 'closing'],
  narrative:          ['hook', 'context', 'body', 'closing'],
  personal_statement: ['hook', 'context', 'reflection', 'connection'],
}

const emptyItem = (id, label) => ({ id, label: label ?? id, status: 'locked', text: null, nuggetText: null })

// Every item id already in the scaffold, across ALL sections.
function allItemIds(components) {
  const ids = new Set()
  for (const s of components ?? []) for (const it of s?.items ?? []) if (it?.id) ids.add(String(it.id))
  return ids
}

/**
 * Mint an item id that collides with NOTHING already in the scaffold.
 *
 * ── Why this is not `c${sectionIndex}` (red-team, 2026-08-16) ────────────────────────
 * A custom scaffold puts every part in ONE section as c0, c1, c2… — Sierra's ten scenes
 * are c0..c9 inside section 0. Deriving a new section's id from its SECTION index therefore
 * mints `c1` for the first grown section, which is already Scene 2's id. `[DONE:c1:…]`
 * takes the local exact match and the exact path lets a revision win over confirmed text,
 * so the coach aiming at Scene 2 would overwrite the grown section's words (or vice versa).
 * That is the "component ids are unique" premise CLAUDE.md records as FALSE, and an earlier
 * version of this file asserted the colliding id as correct in its own test.
 * Ids are therefore minted against every id in the whole tree.
 */
function mintUniqueId(taken, prefix = 'c') {
  let n = 0
  while (taken.has(`${prefix}${n}`)) n++
  const id = `${prefix}${n}`
  taken.add(id)
  return id
}

// The maximum a single call may add. A runaway value (a typo, a bad client, a loop) would
// bloat the scaffold JSON that rides in every coach prompt, so the ceiling is explicit.
export const MAX_GROWTH = 20

// The ESSAY LADDER: the one family whose sections are deliberately different from each
// other, ending in a conclusion. Inheriting the last type on a finished essay would append
// a SECOND conclusion, so — and ONLY here — growth normalises to `body`.
const ESSAY_LADDER = new Set(['introduction', 'body', 'conclusion'])

/**
 * What type should an appended section be?
 *
 * ── The over-correction this replaced (P0, 2026-08-17) ───────────────────────────────
 * The first rule was `last === 'custom' ? 'custom' : 'body'`, which normalised EVERYTHING
 * non-custom to `body`. `narrative` and `personal_statement` are not part of the essay
 * ladder — their sections are all one type by design — so a story grew into
 * topic_sentence/evidence/analysis/transition. Growth was built for Sierra and handed
 * Sierra's own narrative scaffold essay slots. Verified against her real stored shape.
 *
 * ── Why `narrative` grows CUSTOM, not narrative (Robert's call, 2026-08-17) ──────────
 * A `narrative` section carries a `closing` slot. Sierra's holds 152 CONFIRMED words — her
 * ending — so appending ANOTHER narrative section gives every new scene a second, third,
 * fourth ending, compounding the problem with each growth. A `custom` section holds ONE
 * labelled part and has no ending of its own, which is what a scene-per-section story
 * wants. Two consequences worth naming, both checked before the flip:
 *
 *   1. It changes which completion path the new sections take. `/api/sessions/[id]/complete`
 *      runs assembleUnbuiltParagraphs (`type !== 'custom'`) and persistCustomFinals
 *      (`type === 'custom'`) in sequence, and they are exact complements — both gated on
 *      unbuilt + confirmed — so a MIXED scaffold (narrative section 0 + custom scenes) is
 *      fully covered. Verified by the conductor, 2026-08-17.
 *   2. It is a WIN on the ceiling that started this: custom sections persist VERBATIM and
 *      never call the assembly model, so nine of ten scenes become immune to
 *      AssemblyTruncatedError.
 *
 * What this still cannot fix: her existing `closing` sits mid-story the moment anything is
 * appended. Reordering sections would desync `paragraph_index` from the `paragraphs` rows
 * keyed on it — a data-loss shape — so append-only is load-bearing and moving those 152
 * words is a separate, deliberate data move, not something growth may do silently.
 *
 * `personal_statement` keeps inheriting itself: its slots are hook/context/reflection/
 * connection with NO closing, so a second section does not append a second ending.
 */
export function growthTypeFor(lastType) {
  if (lastType === 'custom') return 'custom'
  if (ESSAY_LADDER.has(lastType)) return 'body'
  if (lastType === 'narrative') return 'custom'          // see above — scene-per-section
  if (lastType === 'personal_statement') return lastType
  return 'body'   // unknown/absent — the safest general prose shape
}

/**
 * The default label for an appended CUSTOM section.
 *
 * Derived from the FIRST section's type, not the last: once a narrative has grown once its
 * last section is `custom`, and reading the last type would label scene 2 "Scene 2" and
 * scene 3 "Part 3". The origin type is stable for the life of the scaffold.
 *
 * `index` is the section's 0-based position, so section 1 reads "Scene 2" — an honest
 * ordinal for "the second section", which is all the label claims.
 */
export function growthLabelFor(originType, index) {
  return originType === 'narrative' ? `Scene ${index + 1}` : `Part ${index + 1}`
}

/**
 * Append `addCount` EMPTY sections to a scaffold's components.
 *
 * @param components  the stored components array (untouched — carried by reference)
 * @param addCount    how many sections to append (1..MAX_GROWTH)
 * @param opts.labels optional per-new-section labels, e.g. ['Scene 6','Scene 7']. Used for
 *                    `custom` sections, which carry one labelled item each. Defaults via
 *                    growthLabelFor() off the FIRST section's type.
 * @param opts.type   section type for the new sections. Defaults via growthTypeFor() off
 *                    the LAST existing section's type.
 * @returns { components, added } — a NEW array; never mutates the input.
 * @throws on a non-positive / over-ceiling count, or a missing scaffold.
 */
export function growComponents(components, addCount, opts = {}) {
  const existing = Array.isArray(components) ? components : null
  if (!existing || existing.length === 0) {
    throw new Error('growComponents: refusing to grow a scaffold that has no sections — there is nothing to append to')
  }
  const n = Number(addCount)
  if (!Number.isInteger(n) || n < 1 || n > MAX_GROWTH) {
    throw new Error(`growComponents: addCount must be an integer 1..${MAX_GROWTH}, got ${addCount}`)
  }

  const last = existing[existing.length - 1]
  const type = opts.type ?? growthTypeFor(last?.type)
  const origin = existing[0]?.type
  const labels = Array.isArray(opts.labels) ? opts.labels : []
  const taken = allItemIds(existing)

  const added = Array.from({ length: n }, (_, k) => {
    const index = existing.length + k
    // A custom (non-prose) section holds ONE labelled part. That is the whole point for a
    // scene-per-section story: each scene locks and assembles on its own instead of every
    // scene piling into one container until it hits the ceiling.
    const items = type === 'custom'
      ? [emptyItem(mintUniqueId(taken), labels[k] ?? growthLabelFor(origin, index))]
      : (PROSE_ITEMS[type] ?? PROSE_ITEMS.body).map(id => emptyItem(id))
    return {
      index,
      type,
      status: 'locked',      // never 'working' — growth must not move the coach's focus
      summary: null,
      items,
      // Marks a section this function appended. Nothing branches on it today; it exists so
      // that if a grown scaffold is ever implicated in a loss, the rows say who made them.
      grownAt: opts.now ?? null,
    }
  })

  // Slice, don't mutate: `existing` objects are carried by reference, so every pre-existing
  // section is byte-identical by construction.
  return { components: [...existing, ...added], added: added.length }
}

/**
 * Guard every WHOLE-ARRAY components write against a stale, SHORTER array.
 *
 * ── The divergence growth introduces (red-team, 2026-08-16) ──────────────────────────
 * The scaffold PATCH and the completion snapshot both write the client's entire
 * components array, on the documented premise that the client copy "is always a superset
 * of whatever reached the DB". Growth breaks that premise: any tab open from BEFORE the
 * growth holds a SHORTER array. When that tab locks a component — or completes the
 * session — its array overwrites the stored one, deleting the grown section AND anything
 * confirmed inside it. Completion then freezes the loss into the watcher-facing record.
 *
 * Because growth only ever APPENDS, a shorter incoming array can only mean the sender is
 * stale. So carry the stored tail across instead of letting it be truncated, and say so
 * loudly. This never blocks the student's write; it just refuses to lose sections.
 *
 * @returns { components, carried, reason } — carried = how many stored sections were
 *          re-attached; reason is null when nothing needed carrying.
 */
export function reconcileComponentsWrite(incoming, stored) {
  const inc = Array.isArray(incoming) ? incoming : null
  const sto = Array.isArray(stored) ? stored : []
  if (!inc) return { components: stored, carried: 0, reason: 'incoming was not an array — kept stored' }
  if (inc.length >= sto.length) return { components: inc, carried: 0, reason: null }
  const tail = sto.slice(inc.length)
  return {
    components: [...inc, ...tail],
    carried: tail.length,
    reason: `incoming array had ${inc.length} section(s) but ${sto.length} are stored — ` +
            `sender is stale (sections can only be APPENDED), so ${tail.length} stored section(s) were carried across rather than deleted`,
  }
}

/**
 * The property the endpoint asserts AFTER writing: `next` is `prev` plus exactly
 * `expectedAdded` new sections, with the prefix unchanged.
 *
 * Kept here (pure, tested) rather than inline in the route so the check itself is covered
 * by the suite — an assertion that only exists in a route is an assertion nobody tests.
 *
 * @returns { ok, reason } — reason is null when ok.
 */
export function verifyGrowth(prev, next, expectedAdded) {
  const before = Array.isArray(prev) ? prev : []
  const after = Array.isArray(next) ? next : []
  if (after.length !== before.length + expectedAdded) {
    return { ok: false, reason: `expected ${before.length + expectedAdded} sections, found ${after.length}` }
  }
  for (let i = 0; i < before.length; i++) {
    if (JSON.stringify(before[i]) !== JSON.stringify(after[i])) {
      return { ok: false, reason: `section ${i} CHANGED during growth — existing work must be untouched` }
    }
  }
  for (let i = before.length; i < after.length; i++) {
    const hasText = (after[i]?.items ?? []).some(it => it?.text || it?.nuggetText)
    if (hasText) return { ok: false, reason: `appended section ${i} is not empty` }
  }
  return { ok: true, reason: null }
}

/**
 * What a section should be CALLED when a human (or the coach) reads it.
 *
 * A `custom` section holding exactly ONE labelled part IS that part: a grown story's
 * second section is "Scene 2", not "paragraph 2 (custom)". Returns null when the section
 * has no better name than its type, so callers keep their existing fallback.
 *
 * Mirrors sectionHeading() in components/TutorSession.js, which is what the STUDENT sees.
 * That divergence was the bug: the student's screen said "Scene 2" while the coach's
 * scaffold state said "(custom)" and "c0", so the two were reading different documents.
 * The client should adopt this helper rather than keep its own copy — a rule expressed
 * twice eventually gets expressed differently (see lib/coachTokens.js).
 */
export function sectionDisplayName(para) {
  if (para?.type === 'custom' && para.items?.length === 1) {
    const label = para.items[0]?.label
    if (label && label !== para.items[0]?.id) return label
  }
  return null
}

/**
 * How a component should be identified TO THE COACH: the id it must emit, plus the label
 * the student actually sees when they differ.
 *
 * The id has to stay first and stay exact — it is what [DONE:id:…] carries and what every
 * downstream reconciler matches on. The label is what makes it coachable: "c2" alone gives
 * the coach nothing to ask about, while `c2 ("Star rating out of 5")` says what the field
 * wants. On prose components label === id, so this is byte-identical there.
 */
export function componentDisplayId(item) {
  const id = item?.id
  const label = item?.label
  return label && label !== id ? `${id} ("${label}")` : String(id ?? '')
}
