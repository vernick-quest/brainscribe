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
 */
export function resolveWriteIndex(scaffold) {
  const sections = scaffold?.components ?? []
  if (!sections.length) return 0
  const cur = scaffold.current_paragraph_index ?? 0
  if (cur >= 0 && cur < sections.length) return cur

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
