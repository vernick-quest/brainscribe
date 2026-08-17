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
 * ── The over-correction this fixes (P0, 2026-08-17) ──────────────────────────────────
 * The previous rule was `last === 'custom' ? 'custom' : 'body'`, which normalised
 * EVERYTHING non-custom to `body`. `narrative` and `personal_statement` are not part of the
 * essay ladder — their sections are all one type by design — so a story grew into
 * topic_sentence/evidence/analysis/transition. Growth was built for Sierra and handed
 * Sierra's own narrative scaffold essay slots: she taps "add another section" for scene two
 * and gets an essay body paragraph. Verified against her real stored shape, not by reading.
 *
 * So: normalise the ladder, and let every other family inherit itself.
 *
 * ⚠️ KNOWN CONSEQUENCE, deliberately left for a product call (see BACKLOG P0 and the
 * handback): a `narrative` section carries a `closing` slot. Sierra's holds 152 CONFIRMED
 * words — her ending — so appending another narrative section both puts that ending
 * mid-story AND gives the new scene a second `closing`. Growth cannot fix the first half:
 * reordering sections would desync `paragraph_index` from the `paragraphs` rows keyed on
 * it, which is a data-loss shape, so append-only is load-bearing. It CAN avoid compounding
 * it — `opts.type: 'custom'` with a "Scene N" label appends a continuation section that has
 * no ending of its own, which is what this file's own comment argues a scene-per-section
 * story wants. That is exposed and tested, but not the default, because switching a
 * narrative's growth to custom changes which completion path its sections take
 * (assembleUnbuiltParagraphs vs persistCustomFinals) and that is a product decision, not a
 * bug fix. Essay slots in a story is a bug either way, and that is what this closes.
 */
export function growthTypeFor(lastType) {
  if (lastType === 'custom') return 'custom'
  if (ESSAY_LADDER.has(lastType)) return 'body'
  if (lastType === 'narrative' || lastType === 'personal_statement') return lastType
  return 'body'   // unknown/absent — the safest general prose shape
}

/**
 * Append `addCount` EMPTY sections to a scaffold's components.
 *
 * @param components  the stored components array (untouched — carried by reference)
 * @param addCount    how many sections to append (1..MAX_GROWTH)
 * @param opts.labels optional per-new-section labels, e.g. ['Scene 6','Scene 7'].
 *                    Used for `custom` sections, which carry one labelled item each.
 * @param opts.type   section type for the new sections. Defaults to the LAST existing
 *                    section's type, so a story stays a story and an essay stays an essay.
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
  const labels = Array.isArray(opts.labels) ? opts.labels : []
  const taken = allItemIds(existing)

  const added = Array.from({ length: n }, (_, k) => {
    const index = existing.length + k
    // A custom (non-prose) section holds ONE labelled part. That is the whole point for a
    // scene-per-section story: each scene locks and assembles on its own instead of every
    // scene piling into one container until it hits the ceiling.
    const items = type === 'custom'
      ? [emptyItem(mintUniqueId(taken), labels[k] ?? `Part ${index + 1}`)]
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
