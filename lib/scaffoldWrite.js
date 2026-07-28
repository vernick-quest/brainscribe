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
