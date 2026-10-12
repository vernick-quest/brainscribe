// lib/scaffoldWrite.js — safe writes into the paragraph scaffold.
//
// PURE brain (no React, no Next, no Supabase) so the exact logic the live session runs is
// also unit-testable — same pattern as lib/provenance.js and lib/requirements.js.
// TutorSession.js imports these; it cannot host them itself because it contains JSX.
//
// ── Why this module exists ────────────────────────────────────────────────────────────
// `current_paragraph_index` is deliberately allowed to sit at `components.length` as an
// "all paragraphs done" sentinel (see the PARA_DONE handler in TutorSession). That's fine
// for READING. It was not fine for WRITING: updateComponentItem mapped over components,
// so an index past the end matched nothing and returned the scaffold unchanged — no
// throw, no log. Meanwhile the client had already pushed the text into React state, so
// the student watched their draft grow while none of it was being saved.
//
// Real consequence (2026-07-20): a 250-word personal statement was finalized with only 2
// of its 4 components filled. That parked the cursor past the only section and orphaned
// 'reflection' and 'connection'. The coach's running tally said 185 words; the saved
// draft held 74. A parent found it, not an alert.

/**
 * Resolve a write to a section that actually exists.
 *
 * Prefers the section still holding unfilled components — that's where late content
 * belongs — otherwise the last section. Never returns an out-of-range index for a
 * non-empty scaffold.
 *
 * ── `blockWhenOutOfRange` — for "Keep working on this" continuations ──────────────────
 * The redirect above is a RESCUE: in a normal session the fallback section is the one
 * still being worked, so landing there beats dropping the words. In a v2 continuation
 * that reasoning inverts. v2 inherits v1's cursor, which v1 parked at `components.length`
 * as its "all done" sentinel, and EVERY section is already full of the student's carried
 * v1 words. So the redirect doesn't rescue anything — it targets a finished paragraph and
 * a `[DONE:]` overwrites work the student did in a previous session (reproduced
 * 2026-08-08: work meant for paragraph 0 landed on paragraph 2 and replaced it).
 *
 * There is no correct target to fall back to, because nothing tells us which paragraph
 * the student chose to strengthen — the continuation prompt explicitly leaves that to
 * them. Guessing destroys writing. So callers on a continuation pass this flag and get
 * `null`, meaning REFUSE THE WRITE AND SAY SO — never a silent no-op, never a guess.
 */
import { parseLockPayload } from './lockByReference.js'

export function resolveWriteIndex(scaffold, { blockWhenOutOfRange = false } = {}) {
  const sections = scaffold?.components ?? []
  if (!sections.length) return blockWhenOutOfRange ? null : 0
  const cur = scaffold.current_paragraph_index ?? 0
  if (cur >= 0 && cur < sections.length) return cur

  if (blockWhenOutOfRange) {
    console.error(
      `[continuation-guard] write targeted paragraph ${cur} but this continuation has ${sections.length} ` +
      `section(s), all carried from the finished draft. REFUSING the write — redirecting would overwrite ` +
      `the student's earlier work, and there is no signal for which paragraph they meant.`
    )
    return null
  }

  const firstUnfinished = sections.findIndex(p =>
    (p.items ?? []).some(it => it.status !== 'confirmed' || !(it.text || it.nuggetText))
  )
  const target = firstUnfinished === -1 ? sections.length - 1 : firstUnfinished
  console.warn(
    `[token-safety-net] write targeted paragraph ${cur} but only ${sections.length} section(s) exist — ` +
    `redirecting to ${target} instead of silently dropping the content`
  )
  return target
}

/**
 * Which paragraph POSITION a dictated save targets. `null` means REFUSE THE WRITE.
 *
 * The sibling of resolveWriteIndex for the paragraphs table rather than the components
 * tree, and the one that actually lost writing on 2026-08-08. `/api/paragraphs` upserts
 * on (session_id, position), so a position reused across two saves doesn't duplicate or
 * error — it REPLACES, returning the same row id and a success status either way.
 *
 * Normal sessions keep the exact expression they always had. The refusals are scoped to a
 * continuation, where two distinct targets are both destructive:
 *   · out of range — v1's "all done" sentinel, inherited by every turn, so every save
 *     computes the same position and each overwrites the last;
 *   · in range but occupied — a dictated save writes only the newly spoken words, so
 *     "strengthen paragraph 1" replaces paragraph 1 instead of extending it.
 * Filling a section v1 left genuinely EMPTY stays allowed: in-structure, nothing lost.
 */
export function resolveParagraphWriteIndex({ scaffold, paragraphs = [], isContinuation = false } = {}) {
  const target = scaffold?.current_paragraph_index ?? paragraphs.length   // unchanged for normal sessions
  if (!isContinuation) return target

  const sections = scaffold?.components?.length ?? 0
  // A scaffold-less continuation appends as before: `paragraphs` grows with every save,
  // so successive positions differ and nothing can collide.
  if (!sections) return target

  if (!(target >= 0 && target < sections)) {
    console.error(
      `[continuation-guard] dictated save targeted paragraph ${target} but this continuation has ` +
      `${sections} carried section(s). REFUSING — reusing this position overwrites the previous save.`
    )
    return null
  }

  const occupied = (paragraphs ?? []).some(p =>
    (p.paragraph_index ?? p.position) === target && String(p.scribed_text ?? '').trim()
  )
  if (occupied) {
    console.error(
      `[continuation-guard] dictated save targeted paragraph ${target}, which already holds carried ` +
      `writing. REFUSING — this save replaces the row rather than adding to it.`
    )
    return null
  }
  return target
}

/**
 * Decide what text a `[DONE:…]` should lock in — and say so when there ISN'T any.
 *
 * ── The second silent-drop path (found 2026-07-28) ────────────────────────────────────
 * `resolveWriteIndex` closed the out-of-range hole. It did NOT close this one. The DONE
 * handler used to read:
 *
 *     const text = inlineText || item.nuggetText || item.text || ''
 *     if (!text) return item          // <- silently drops the lock-in
 *
 * The guard is right to refuse an empty confirm (a blank "✓" line renders as nothing),
 * but returning the item untouched means the coach says "locked in", the student sees it
 * locked in, and the database never hears about it.
 *
 * Real consequence: Elio's 2026-06-26 astronaut paragraph. The coach built the body over
 * five exchanges without ever emitting a [NUGGET:], then sent a bare [DONE:body] with no
 * inline text — so there was nothing to fall back to. 35 seconds later he typed "The body
 * is not showing where all my writing is". He was right; it is still empty in prod.
 *
 * We deliberately do NOT invent text here. The last student turn is usually "Yes" (they
 * were approving an edit), so writing that in would be worse than the hole. Instead the
 * caller marks the item `writeDropped`, which turns an unprovable inference in the
 * integrity detector into a recorded fact — see lib/draftIntegrity.js.
 *
 * @returns {{ text: string, source: 'inline'|'nugget'|'existing'|'none', dropped: boolean }}
 */
export function resolveDoneText(item, inlineText = '') {
  const inline = String(inlineText || '').trim()

  // ── ORDER-INDEPENDENCE GUARD for lock-by-reference (SPEC-lock-by-reference.md) ──────
  // The anchored form is `[DONE:body:"first words"…"last words"]`. If the PROMPT lane ships
  // before the CLIENT lane wires lib/lockByReference.js, this function receives that anchor
  // string as `inlineText` and — with no guard — returns it as the text, dropped:false. The
  // student's 900 words are replaced by ~15 characters of quotation and the lock reports
  // SUCCESS. Verified against this exact function before the guard existed.
  //
  // The two lanes are supposed to land together. This is what happens when they don't.
  // Refuse loudly instead: `dropped` marks the item so the integrity detector records it,
  // and the student's existing text is never overwritten by an unresolved reference.
  //
  // Once the client resolves anchors upstream, it passes RESOLVED text here and this never
  // fires — the guard costs nothing and stays as the insurance it is.
  if (inline && parseLockPayload(inline).kind === 'anchored') {
    console.error(
      `[scaffold] REFUSED an UNRESOLVED anchored lock for "${item?.id ?? '?'}": ${inline.slice(0, 80)}\n` +
      `  The coach referenced a span of the student's own writing, but this client did not ` +
      `resolve it — lib/lockByReference.js is not wired into the write path yet. Saving the ` +
      `anchor text would REPLACE the student's passage with the quotation marks around it.`
    )
    return { text: '', source: 'none', dropped: true }
  }

  if (inline) return { text: inline, source: 'inline', dropped: false }
  if (item?.nuggetText) return { text: item.nuggetText, source: 'nugget', dropped: false }
  if (item?.text) return { text: item.text, source: 'existing', dropped: false }

  console.error(
    `[scaffold] DROPPED LOCK-IN: [DONE:${item?.id ?? '?'}] carried no text and no prior ` +
    `[NUGGET:] was captured, so there is nothing to save. The coach has told the student ` +
    `this component is locked in. Flagging it on the item so the integrity check can see it.`
  )
  return { text: '', source: 'none', dropped: true }
}

/**
 * Resolve the component a stream token is talking about — including when the coach names
 * one that doesn't exist in this scaffold.
 *
 * ── The THIRD silent-drop path (Baron's Gratitude Letter, 2026-08-04) ─────────────────
 * A non-prose assignment builds a CUSTOM scaffold whose items are named by position —
 * `c0`, `c1`, … (see buildComponentTree). The coach went on to emit [DONE:hook],
 * [DONE:context] and [DONE:closing] — the standard prose names, none of which exist in a
 * custom scaffold. updateComponentItem found no match, logged, and returned the scaffold
 * untouched, so `c0` never left `candidate`. The assembly only takes `confirmed` items, so
 * 151 of the student's words were dropped from the Final Draft while sitting safely in the
 * scaffold the whole time. He noticed and reported it himself.
 *
 * The lesson from the first two paths applies again: a token that doesn't line up with
 * stored state must be REDIRECTED, not discarded. We cannot make the model always name the
 * right id, so the client must not depend on it.
 *
 * Returns the exact match when there is one. Otherwise the component the session is
 * actually working on — the first unconfirmed item, else the last — and flags it inexact so
 * the caller can refuse to overwrite real text on a guess.
 *
 * @returns {{ id: string, exact: boolean } | null}
 */
export function resolveComponentTarget(section, componentId) {
  const items = section?.items ?? []
  if (!items.length) return null

  const wanted = String(componentId ?? '').trim().toLowerCase()
  const exact = items.find(it => String(it.id).toLowerCase() === wanted)
  if (exact) return { id: exact.id, exact: true }

  // No such id. Fall back to where work is actually happening.
  const unconfirmed = items.find(it => it.status !== 'confirmed')
  const target = unconfirmed ?? items[items.length - 1]
  console.warn(
    `[token-safety-net] coach named component "${componentId}" but this scaffold has ` +
    `[${items.map(i => i.id).join(', ')}] — applying to "${target.id}" instead of dropping the write`
  )
  return { id: target.id, exact: false }
}

/**
 * Should this write PRESERVE the words already in the target instead of replacing them?
 *
 * ── Why crossSection counts as "inferred" (coach-ai + conductor, 2026-08-17) ─────────
 * `resolveComponentWrite` returns `exact: true` for a CROSS-SECTION hit, and the [DONE:]
 * handler's no-overwrite guard tested `exact` alone — so a redirect into another section
 * skipped the guard entirely and overwrote confirmed text. The id matched exactly, but
 * WHICH SECTION the coach meant is still an inference: an id that belongs to another
 * section's template (a body paragraph emitting `hook`) lands on the intro's finished
 * hook and replaces it with body content.
 *
 * The two populations are structurally identical — a legitimate thesis revisit from a
 * body paragraph and a mis-aimed id both look like "exact id, other section" — and the
 * only thing that could tell them apart is fuzzy text matching, which this file's history
 * says never to decide writes from. So the tie goes to the words already on the page:
 * six paths have destroyed student writing here, against one cost of refusing a redirect.
 * A refused revision is recoverable (Revise/Edit, or the coach retrying with the cursor
 * on that section); an overwritten paragraph is not.
 *
 * Scoped deliberately: this only fires when there IS text to lose. A cross-section write
 * into an EMPTY component still lands — that is the redirect doing its job with no
 * possible loss, which is the case Baron's 151 dropped words argued for.
 *
 * ACTIVE needs no equivalent — it writes `status` only, never text. NUGGET DOES need it:
 * it refuses on `confirmed` but happily replaces a CANDIDATE's nuggetText, and those are
 * the student's captured words by the same standard this function applies. (An earlier
 * version of this comment claimed NUGGET was safe. It was safe for `confirmed` only.)
 */
export function shouldPreserveExisting(target, item) {
  if (!(item?.text || item?.nuggetText)) return false     // nothing to lose — let it write
  return !target?.exact || !!target?.crossSection
}

/**
 * The item to store when an inferred write is refused.
 *
 * BANKS the words rather than leaving them behind. A cross-section `[DONE:]` is not
 * evidence the student approved THIS component, which argues for leaving the item
 * untouched — but a `candidate` left as a candidate is dropped at assembly (which takes
 * confirmed items only), and that is Baron's shape: the student's own captured words
 * silently missing from the Final Draft. Between "a component confirmed a beat early" and
 * "words gone from the deliverable", this repo's history is unambiguous — bank them.
 *
 * And STAMP it. The refusal was previously a console line only, so nothing downstream
 * could see that a revision the coach announced never landed: the commitment reconciler
 * counts the promise kept (the id is filled) and the integrity detector sees no orphan.
 * `revisionRefused` makes it a recorded fact on the row instead of a devtools artifact.
 */
export function preserveExistingItem(item, target, incomingText = '') {
  const incoming = String(incomingText ?? '').trim()
  return {
    ...item,
    status: 'confirmed',
    text: item.text || item.nuggetText,
    writeDropped: false,
    revisionRefused: target?.crossSection ? 'cross-section' : 'inexact',
    // BANK what the refused write carried (round-2 review, finding #5). A guessed id past the
    // end of the scaffold ([DONE:c5:…] on five sections) resolves here, and the 60 words the
    // student had just dictated used to be stored nowhere while the coach said "locked".
    // Words the student said must always exist somewhere recoverable.
    ...(incoming && normQuotes(incoming) !== normQuotes(item.text || item.nuggetText || '') ? {
      refusedText: incoming,
      // a previous refusal's words move to the trail, never overwritten
      ...(item.refusedText && normQuotes(item.refusedText) !== normQuotes(incoming)
        ? { replaced: [item.refusedText, ...(Array.isArray(item.replaced) ? item.replaced : [])].slice(0, REPLACED_BANK_SIZE) } : {}),
    } : {}),
  }
}

// Curly quotes from Google Docs / Word must compare equal to straight ones everywhere a write
// decision compares text (round-2 #4): the duplicate check, "unchanged", and the fragment net.
const normQuotes = s => String(s ?? '').replace(/[‘’ʼ′]/g, "'").replace(/[“”″]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()

// ── Duplicate refusal (starting-draft eval, 2026-10-11; reworked after round-2 review) ─────
//
// THE SEVENTH SHAPE, AND THE FIRST THAT ADDS WORDS INSTEAD OF LOSING THEM. A coach told "section
// 2 is empty" re-locked paragraph 2 into section 2 while it still sat in section 1's context —
// a 740-word sim essay carried a 168-word paragraph twice, inflating the count the coach is held
// to (computeActualLive).
//
// 🔴 ROUND 2 — THE NET DESTROYED TEXT WHEN IT COMPOSED WITH AN ORDINARY REVISION. The first
// version counted a SIBLING part of the same prose section as "another part". "Make my analysis
// the evidence, here's new analysis": [DONE:evidence:A] was refused (A sits in analysis), then
// [DONE:analysis:N] — an exact revision — replaced A, and A existed nowhere. Before the net the
// move simply landed. Each step was correct alone; together they lost a paragraph. Exactly the
// CLAUDE.md shape. The design now holds ONE invariant, pinned by a generated test against the
// pre-change logic (scaffoldWriteInvariant.test.js): no token sequence may make confirmed text
// vanish from the Draft AND its banks where the old code kept it. Four rules carry it:
//
//   1. Same-section parts are never duplicates of each other, in ANY section type. Moves and
//      swaps inside a section behave exactly as before the net. (Cost: a paragraph repeated
//      inside ONE section's parts is no longer caught; every measured duplicate was across
//      sections, and the prompt now prevents those.)
//   2. Containment is ONE-way: refuse only when the INCOMING text is ≥80% contained in the
//      existing text. A bigger lock that merely contains a confirmed paragraph is written —
//      refusing it threw away its new words.
//   3. Every refusal BANKS the refused text on the target part (duplicateOf.text). The student
//      can put it there anyway with one tap; nothing the coach tried to lock is ever discarded.
//   4. DEFERRED MOVE (applyDoneWrite): when the SOURCE part is later overwritten and the target
//      part is unchanged since the refusal, the banked text lands in the target first — the
//      state the old code would have had all along. A refused move can therefore never become
//      a loss when its second half arrives, this turn or any later one.
//
// Not a duplicate either: restatement roles (thesis_restate / echo / synthesis — restating is
// their job), and anything aimed at a custom section of a scaffold that is NOT the
// starting-draft shape (poem refrains, grown-story scene refrains) — the net exists for the
// starting-draft population and the legacy cross-section re-lock, nothing wider.
//
// Thresholds: DUP_MIN_WORDS = 20 (the incoming text must be at least this long — refrains, echo
// lines and short repeated phrases are short); 5-word shingles; DUP_CONTAINMENT = 0.8 (verbatim
// re-lock 1.0, a typo fix ~0.85+, two paragraphs sharing a stock phrase < 0.2).
export const DUP_MIN_WORDS = 20
export const DUP_SHINGLE = 5
export const DUP_CONTAINMENT = 0.8
export const RESTATE_IDS = new Set(['thesis_restate', 'echo', 'synthesis'])

const dupWords = s => normQuotes(s).toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean)
const shingleSet = words => {
  const out = new Set()
  for (let i = 0; i + DUP_SHINGLE <= words.length; i++) out.add(words.slice(i, i + DUP_SHINGLE).join(' '))
  return out
}
// Fraction of `a`'s shingles that also appear in `b`.
function containment(aWords, bWords) {
  const A = shingleSet(aWords)
  if (!A.size) return 0
  const B = shingleSet(bWords)
  let k = 0
  for (const s of A) if (B.has(s)) k++
  return k / A.size
}

/** Is `incoming` (20+ words) mostly contained in `existing`? ONE-way by design (rule 2). */
export function isNearDuplicate(incoming, existing) {
  const A = dupWords(incoming)
  return A.length >= DUP_MIN_WORDS && containment(A, dupWords(existing)) >= DUP_CONTAINMENT
}

const isDraftShaped = sc => {
  const s = Array.isArray(sc?.components) ? sc.components : []
  return s.length > 1 && s.every(x => x?.type === 'custom' && (x.items?.length ?? 0) === 1)
}
const partLabel = (sections, i, it) => {
  const sec = sections[i]
  if ((sec?.items?.length ?? 0) === 1 && it?.label) return it.label
  return `Paragraph ${Number(i) + 1}${it ? ` (${it.label ?? it.id})` : ''}`
}

/**
 * Is `text` already confirmed in a part of a DIFFERENT section (or another section's row)?
 *
 * @param scaffold    the scaffold BEFORE this write
 * @param paraIdx,id  the resolved target of the write
 * @param text        the RESOLVED text the write would store (after resolveDoneText)
 * @param opts.paragraphs  `paragraphs` rows; another section's row is what it renders
 * @returns {{ paraIdx, id, label } | null} where the text already lives
 */
export function findConfirmedDuplicate(scaffold, paraIdx, id, text, { paragraphs = [] } = {}) {
  if (!String(text ?? '').trim()) return null
  if (RESTATE_IDS.has(String(id))) return null
  const sections = scaffold?.components ?? []
  if (sections[paraIdx]?.type === 'custom' && !isDraftShaped(scaffold)) return null
  for (let i = 0; i < sections.length; i++) {
    if (i === paraIdx) continue                                          // rule 1: siblings never count
    for (const it of sections[i]?.items ?? []) {
      if (it.status !== 'confirmed') continue
      const existing = it.text || it.nuggetText
      if (existing && isNearDuplicate(text, existing)) return { paraIdx: i, id: it.id, label: partLabel(sections, i, it) }
    }
  }
  for (const row of paragraphs ?? []) {
    const i = row?.paragraph_index ?? row?.position
    if (i === paraIdx) continue
    if (row?.scribed_text && isNearDuplicate(text, row.scribed_text)) {
      return { paraIdx: i, id: null, label: sections[i]?.items?.length === 1 ? sections[i].items[0].label : `Paragraph ${Number(i) + 1}` }
    }
  }
  return null
}

/**
 * The item to store when a write is refused as a duplicate: UNCHANGED text and status, plus a
 * stamp that BANKS the refused words (`text`) and remembers what the part held at refusal time
 * (`prev`, for the deferred move). Never a silent no-op — the stamp is what the Draft panel
 * renders (with an "add them here anyway" button), what the coach's scaffold state reports,
 * and what the integrity check counts.
 */
export function refuseDuplicateItem(item, dup, refusedText = '') {
  // A second refusal on the same part must not overwrite the first one's bank.
  const base = clearDuplicateStamp(item)
  return { ...base, duplicateOf: {
    paraIdx: dup.paraIdx, id: dup.id ?? null, label: dup.label ?? null,
    text: String(refusedText ?? '').trim() || null,
    prev: base.text || base.nuggetText || null,
  } }
}

/**
 * What a `[DONE:]` does to the item it resolved to — every net, in ONE order, in ONE place.
 *   0. unchanged  — the part already holds these words (quote style ignored): no write, no stamp;
 *   1. preserve   — an inferred target (inexact id, or cross-section) never overwrites text;
 *                   the incoming words are banked (refusedText);
 *   2. fragment   — a recap quoting part of the confirmed text keeps the longer version;
 *   3. dropped    — no text anywhere: stamp writeDropped, never confirm a blank;
 *   4. duplicate  — the text is mostly contained in a part of ANOTHER section: refuse, bank, stamp;
 *   5. written    — confirm it.
 * Use applyDoneWrite to apply it — that is where the deferred move lives.
 *
 * @returns {{ item, outcome: 'unchanged'|'preserved'|'fragment'|'dropped'|'duplicate'|'written', dup? }}
 */
export function decideDoneWrite({ scaffold, target, item, inlineText = '', paragraphs = [] }) {
  // A BARE [DONE:id] on a part that already holds confirmed text is a re-confirm — the coach
  // acknowledging a panel lock-in ("Add them here anyway" / confirmNugget). Writing it again
  // would only re-run the duplicate check against the student's explicit choice, or stamp a
  // cross-section revisionRefused over a change nobody made.
  if (item.status === 'confirmed' && item.text && (!String(inlineText ?? '').trim() || normQuotes(item.text) === normQuotes(inlineText))) {
    return { item, outcome: 'unchanged' }
  }
  if (shouldPreserveExisting(target, item)) return { item: preserveExistingItem(item, target, inlineText), outcome: 'preserved' }
  if (item.status === 'confirmed' && item.text && inlineText
      && item.text.length > inlineText.length
      && normQuotes(item.text).toLowerCase().includes(normQuotes(inlineText).toLowerCase())) {
    return { item, outcome: 'fragment' }
  }
  const { text, dropped } = resolveDoneText(item, inlineText)
  if (dropped) return { item: { ...item, writeDropped: true }, outcome: 'dropped' }
  const dup = findConfirmedDuplicate(scaffold, target.paraIdx, target.id, text, { paragraphs })
  if (dup) return { item: refuseDuplicateItem(item, dup, text), outcome: 'duplicate', dup }
  return { item: { ...clearDuplicateStamp(withReplacedBank(item, text)), status: 'confirmed', text, writeDropped: false }, outcome: 'written' }
}

/**
 * Clear a duplicate-refusal stamp WITHOUT discarding its bank: the refused words move into the
 * `replaced` trail. The generated invariant test found the leak — a later write landing on a
 * refused part cleared the stamp and the only copy of the words the old code had put there.
 * Use this everywhere a stamp is cleared (writes here; confirmNugget and Revise in the client).
 */
export function clearDuplicateStamp(item) {
  // Also retires a refused REVISION's banked words (preserveExistingItem's refusedText), so the
  // coach stops being told "a lock aimed here was refused" once the part has been written since.
  if (!item?.duplicateOf && !item?.refusedText) return item
  const banked = [item?.duplicateOf?.text, item?.refusedText].filter(Boolean)
  const next = { ...item, duplicateOf: null }
  delete next.refusedText
  if (!banked.length) return next
  return { ...next, replaced: [...banked, ...(Array.isArray(item.replaced) ? item.replaced : [])].slice(0, REPLACED_BANK_SIZE) }
}

/**
 * A write that REPLACES different confirmed text keeps the replaced words on the item
 * (`replaced`, newest first, last REPLACED_BANK_SIZE versions). Data only — nothing renders it.
 *
 * Why (round-2 generated invariant test): a refusal changes the STATE, and a changed state
 * changes where LATER tokens route. One refused lock left a section incomplete, so Net A did
 * not advance the cursor, so a later [DONE:topic_sentence:…] became an exact revision of the
 * current section instead of landing in the next one — and overwrote words the old code had
 * kept. No local rule can foresee every re-route. Banking what a revision replaces makes the
 * invariant hold for ANY sequence: everything ever confirmed survives in the Draft or a bank.
 * Ordinary revisions lose nothing they did not lose before; they just leave a trail.
 */
export const REPLACED_BANK_SIZE = 10
function withReplacedBank(item, nextText) {
  const prev = item.status === 'confirmed' ? (item.text || item.nuggetText || '') : ''
  if (!prev || normQuotes(prev) === normQuotes(nextText)) return item
  // A revision that only EXTENDS the old text keeps every old word in the Draft already.
  if (normQuotes(nextText).toLowerCase().includes(normQuotes(prev).toLowerCase())) return item
  return { ...item, replaced: [prev, ...(Array.isArray(item.replaced) ? item.replaced : [])].slice(0, REPLACED_BANK_SIZE) }
}

/**
 * Apply one resolved `[DONE:]` to the scaffold: decideDoneWrite, then the DEFERRED MOVE (rule 4).
 *
 * When this write REPLACES confirmed text X in part S, every part that holds a refusal pointing
 * at S whose banked text was X's duplicate gets that text now — if the part is unchanged since
 * the refusal (its content still equals `prev`). That is the old code's state exactly: the moved
 * words in the target, the source revised. If the target HAS changed since, landing the banked
 * text would overwrite newer words, so it stays banked (still recoverable, still shown).
 *
 * @returns {{ scaffold, outcome, dup?, moved: Array<{ paraIdx, id }> }}
 */
export function applyDoneWrite(scaffold, target, inlineText = '', { paragraphs = [] } = {}) {
  const before = scaffold?.components?.[target.paraIdx]?.items?.find(it => it.id === target.id)
  let decision = null
  let sc = updateComponentItem(scaffold, target.paraIdx, target.id, item => {
    decision = decideDoneWrite({ scaffold, target, item, inlineText, paragraphs })
    return decision.item
  })
  const moved = []
  const oldText = before?.status === 'confirmed' ? (before.text || before.nuggetText || '') : ''
  const after = sc?.components?.[target.paraIdx]?.items?.find(it => it.id === target.id)
  if (decision?.outcome === 'written' && oldText && normQuotes(oldText) !== normQuotes(after?.text)) {
    sc = {
      ...sc,
      components: sc.components.map((sec, i) => ({
        ...sec,
        items: (sec.items ?? []).map(it => {
          const d = it.duplicateOf
          if (!d?.text || d.paraIdx !== target.paraIdx || d.id !== target.id) return it
          if (!isNearDuplicate(d.text, oldText)) return it
          // A MOVE means the words LEFT the source. If the source's new text still holds them (a
          // light revision of the same paragraph), landing the old copy would resurrect exactly
          // the duplicate the refusal stopped — so it stays banked instead (the invariant is held
          // by the banks either way; this only decides whether the Draft shows it).
          if (isNearDuplicate(d.text, after?.text ?? '')) return it
          const current = it.text || it.nuggetText || null
          if (normQuotes(current ?? '') !== normQuotes(d.prev ?? '')) return it   // changed since: keep banked
          moved.push({ paraIdx: i, id: it.id })
          // The landing replaces whatever the target held at refusal time — bank it, like every overwrite.
          return { ...withReplacedBank(it, d.text), status: 'confirmed', text: d.text, writeDropped: false, duplicateOf: null, movedFrom: { paraIdx: d.paraIdx, id: d.id } }
        }),
      })),
    }
    if (moved.length) console.warn(`[duplicate-guard] paragraph ${target.paraIdx} "${target.id}" was rewritten — landing the move that was refused earlier into ${moved.map(m => `${m.paraIdx}.${m.id}`).join(', ')} so those words are not lost`)
  }
  return { scaffold: sc, outcome: decision?.outcome ?? 'unresolved', dup: decision?.dup, moved }
}

/**
 * Apply `updater` to one component of one paragraph section.
 *
 * Fails LOUD rather than no-op. Both guards below used to fall through to a .map() that
 * matched nothing and returned the scaffold untouched — which is exactly how a student's
 * writing disappeared without leaving a trace.
 */
export function updateComponentItem(scaffold, paraIdx, componentId, updater) {
  const sections = scaffold?.components ?? []
  if (paraIdx < 0 || paraIdx >= sections.length) {
    console.error(
      `[scaffold] DROPPED WRITE: paragraph ${paraIdx} is out of range (${sections.length} section(s)), ` +
      `component "${componentId}". Unreachable if callers use resolveWriteIndex().`
    )
    return scaffold
  }
  if (!(sections[paraIdx].items ?? []).some(it => it.id === componentId)) {
    console.error(
      `[scaffold] DROPPED WRITE: no component "${componentId}" in paragraph ${paraIdx} ` +
      `(has: ${(sections[paraIdx].items ?? []).map(i => i.id).join(', ') || 'none'}).`
    )
    return scaffold
  }
  return {
    ...scaffold,
    components: sections.map((p, i) =>
      i !== paraIdx ? p : {
        ...p,
        items: p.items.map(item => (item.id === componentId ? updater(item) : item)),
      }
    ),
  }
}

/**
 * Resolve a token to the section AND component it belongs to, across the whole scaffold.
 *
 * ── Why section-local resolution wasn't enough (red-team, 2026-08-04) ─────────────────
 * The coach is explicitly instructed to revisit the thesis while working on later
 * paragraphs. A [DONE:thesis:new wording] emitted from a body paragraph therefore looked
 * like an UNKNOWN id, and the inexact fallback either discarded the revision or wrote the
 * thesis into the body's `evidence` slot.
 *
 * ── Why "search every section" was ALSO wrong (second red-team pass) ──────────────────
 * My first fix assumed component ids are unique across a prose template. They are NOT:
 * getParaItems gives EVERY body paragraph the same four ids (topic_sentence, evidence,
 * analysis, transition). Taking the first match meant a revision aimed at body 3 landed on
 * body 1 — overwriting a CONFIRMED component in a paragraph the student had finished, and
 * the exact-match path skips the no-overwrite guard. The fix introduced a new way to lose
 * writing, which is the only outcome worse than the bug it replaced.
 *
 * So a cross-section write is honoured ONLY when the id is unambiguous — exactly one
 * section outside the cursor holds it. Otherwise we fall back to the local inexact path,
 * which refuses to overwrite real text.
 *
 * @param assembledIndexes  sections that already have a `paragraphs` row. Their prose is
 *   what the Final Draft renders, so a scaffold-only write there updates a checklist the
 *   deliverable no longer reads — the same divergence we removed the manual Revise button
 *   for. Refuse instead, and let the caller record it.
 * @returns {{ paraIdx, id, exact, crossSection } | null}
 */
export function resolveComponentWrite(scaffold, paraIdx, componentId, { assembledIndexes = [] } = {}) {
  const sections = scaffold?.components ?? []
  if (!sections.length) return null

  const local = resolveComponentTarget(sections[paraIdx], componentId)
  if (local?.exact) return { paraIdx, id: local.id, exact: true, crossSection: false }

  const wanted = String(componentId ?? '').trim().toLowerCase()

  // ── A prose name against a CUSTOM section stays local (red-team, 2026-08-17) ────────
  // Baron's rescue (resolveComponentTarget's fallback) exists for exactly one shape: the
  // coach emits a standard prose id — hook, context, closing — at a custom scaffold whose
  // ids are positional (c0, c1…). It worked because a custom scaffold had nowhere else to
  // send the write. Narrative growth broke that: a story is now section 0 `narrative`
  // (hook/context/body/closing) plus custom scenes (c0, c1…), so those id spaces are
  // DISJOINT and every prose name emitted on a scene is an "unambiguous" cross-section hit
  // into section 0 — where the cross-section guard then (correctly) refuses to overwrite
  // her confirmed words. Three individually-correct guards, and the scene's text lands
  // NOWHERE. Reproduced against her real stored shape before this was written.
  //
  // So: on a custom section, a NON-positional id is Baron's case, not a cross-section
  // revision, and it resolves here. Positional ids (c3 aimed at an earlier scene) keep the
  // cross-section path — those really can name another section. `exact:false` is honest,
  // and it means the no-overwrite guard still protects a scene that already has words.
  if (sections[paraIdx]?.type === 'custom' && local && !/^c\d+$/.test(wanted)) {
    console.warn(
      `[token-safety-net] "${componentId}" is a prose component name and paragraph ${paraIdx} is a ` +
      `custom section [${(sections[paraIdx].items ?? []).map(i => i.id).join(', ')}] — keeping the write ` +
      `HERE rather than redirecting it into another section, where it would be refused and lost`
    )
    return { paraIdx, id: local.id, exact: false, crossSection: false }
  }

  // Not here. Is it unambiguously somewhere else?
  const hits = []
  for (let i = 0; i < sections.length; i++) {
    if (i === paraIdx) continue
    const hit = (sections[i].items ?? []).find(it => String(it.id).toLowerCase() === wanted)
    if (hit) hits.push({ i, id: hit.id })
  }

  if (hits.length === 1) {
    const { i, id } = hits[0]
    if (assembledIndexes.includes(i)) {
      // The prose for that paragraph is already assembled and is what renders. Writing the
      // scaffold alone would show the student a revision the Final Draft never receives.
      console.error(
        `[scaffold] REFUSED cross-section write of "${componentId}" into paragraph ${i}: it is ` +
        `already assembled, so only its paragraphs row reaches the Final Draft. Recording it ` +
        `rather than showing a revision that never lands.`
      )
      return null
    }
    console.warn(
      `[token-safety-net] "${componentId}" belongs to paragraph ${i}, not the cursor's ` +
      `paragraph ${paraIdx} — writing it where it actually lives`
    )
    return { paraIdx: i, id, exact: true, crossSection: true }
  }

  if (hits.length > 1) {
    // Repeated id (every body paragraph shares its four). We cannot tell which was meant,
    // and guessing overwrites a finished paragraph. Stay local, where the inexact guard
    // protects existing text.
    console.warn(
      `[token-safety-net] "${componentId}" appears in ${hits.length} sections — ambiguous, ` +
      `so staying in paragraph ${paraIdx} rather than overwriting a finished one`
    )
  }

  return local ? { paraIdx, id: local.id, exact: false, crossSection: false } : null
}
