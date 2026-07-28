// lib/draftIntegrity.js — did the student's Final Draft lose any of their work?
//
// PURE brain (no Next/Supabase imports) so the same check runs in the admin panel, in a
// unit test, and in a script — same pattern as lib/provenance.js and lib/requirements.js.
//
// WHY THIS EXISTS
// A student finished a 250-word personal statement on 2026-07-20. The coach's running
// tally said 185 words; the Final Draft rendered 74. The words were real — they were in
// React state, on screen, in the working draft — but every save had been silently
// discarded because the scaffold cursor had advanced past the last section and
// updateComponentItem's .map() matched nothing. Nothing threw. Nothing logged. The only
// person who noticed was a parent reading the finished essay.
//
// The lesson is that the failure was INVISIBLE, so the fix is only half the answer: this
// module makes the same class of loss detectable after the fact.
//
// TWO SIGNALS, because one is not enough:
//
//   1. ORPHANED CONTENT — text that exists in the scaffold but never made it into the
//      rendered draft. This is the literal "working draft is longer than final draft"
//      check.
//
//   2. UNFILLED COMPONENTS ON A FINISHED SESSION — a completed essay whose scaffold
//      still has empty slots. Signal 1 alone would NOT have caught the 2026-07-20 loss:
//      the lost text never reached the scaffold either, so working and final looked
//      identical. What gave it away was that 2 of the 4 components were still empty on a
//      session marked complete. Any detector without this signal gives false comfort.

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const countWords = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length

/** Every scaffold item that holds text, flattened. Mirrors the transcript's own read. */
export function scaffoldItemsWithText(components) {
  return (components ?? [])
    .flatMap((sec, secIdx) => (sec.items ?? []).map(it => ({ ...it, sectionIndex: secIdx })))
    .filter(it => it.text || it.nuggetText)
    .map(it => ({ ...it, value: it.text || it.nuggetText }))
}

/**
 * Reproduces EXACTLY what app/transcript/[id]/page.js renders as the Final Draft.
 * Kept deliberately in lockstep with that file — if the render changes, change this too,
 * or the alert silently stops measuring the thing it claims to measure.
 */
export function renderedDraftText(paragraphs, components) {
  if (paragraphs?.length) return paragraphs.map(p => p.scribed_text).filter(Boolean).join('\n\n')
  return scaffoldItemsWithText(components).map(it => it.value).join('\n')
}

/**
 * @param paragraphs   rows from `paragraphs`, ordered by position
 * @param components   `paragraph_scaffolds.components`
 * @param opts.currentParagraphIndex  scaffold cursor
 * @param opts.status  session status ('complete' | 'active' | …)
 * @param opts.targetWords  the assignment's word target, when it has one
 *
 * @returns {{
 *   ok: boolean, severity: 'none'|'warn'|'alert', reasons: string[],
 *   finalWords: number, workingWords: number, orphanedWords: number,
 *   orphanedComponents: string[], unfilledComponents: string[],
 *   cursorOutOfRange: boolean, targetWords: number|null, shortfallPct: number|null
 * }}
 */
export function checkDraftIntegrity(paragraphs = [], components = [], opts = {}) {
  const { currentParagraphIndex = null, status = null, targetWords = null } = opts

  const finalText = renderedDraftText(paragraphs, components)
  const finalWords = countWords(finalText)
  const finalNorm = norm(finalText)

  // --- Signal 1: content in the scaffold that the rendered draft doesn't contain ------
  // Containment, not summation: the scaffold usually DUPLICATES what was scribed into a
  // paragraph, so adding the two together would report phantom loss on healthy sessions.
  const withText = scaffoldItemsWithText(components)
  const orphaned = withText.filter(it => {
    const v = norm(it.value)
    if (!v) return false
    if (finalNorm.includes(v)) return false
    // Tolerate light scribe edits: if most content words survived, it's not orphaned.
    const words = v.split(' ').filter(w => w.length > 3)
    if (!words.length) return false
    const kept = words.filter(w => finalNorm.includes(w)).length
    return kept / words.length < 0.6
  })
  const orphanedWords = orphaned.reduce((n, it) => n + countWords(it.value), 0)

  // --- Signal 2: a finished session with empty slots ---------------------------------
  const unfilled = (components ?? []).flatMap((sec, i) =>
    (sec.items ?? [])
      .filter(it => !(it.text || it.nuggetText))
      .map(it => `p${i}:${it.id}`)
  )

  const sectionCount = (components ?? []).length
  const cursorOutOfRange =
    currentParagraphIndex !== null && sectionCount > 0 && currentParagraphIndex >= sectionCount

  const shortfallPct =
    targetWords && targetWords > 0 ? Math.round((1 - finalWords / targetWords) * 100) : null

  const reasons = []
  let severity = 'none'
  const isComplete = status === 'complete'

  if (orphanedWords > 0) {
    reasons.push(
      `${orphanedWords} word(s) exist in the working draft but are missing from the Final Draft ` +
      `(${orphaned.map(o => o.id).join(', ')})`
    )
    severity = 'alert'
  }
  if (isComplete && unfilled.length > 0) {
    reasons.push(
      `finished with ${unfilled.length} empty component(s): ${unfilled.join(', ')} — ` +
      `content coached for these may never have been saved`
    )
    severity = 'alert'
  }
  if (isComplete && shortfallPct !== null && shortfallPct >= 30) {
    reasons.push(`Final Draft is ${shortfallPct}% under the ${targetWords}-word target (${finalWords}w)`)
    if (severity === 'none') severity = 'warn'
  }
  if (cursorOutOfRange && unfilled.length > 0) {
    reasons.push(
      `scaffold cursor (${currentParagraphIndex}) is past the last section (${sectionCount}) ` +
      `while components are still empty — the signature of dropped writes`
    )
    severity = 'alert'
  }

  return {
    ok: severity === 'none',
    severity,
    reasons,
    finalWords,
    workingWords: finalWords + orphanedWords,
    orphanedWords,
    orphanedComponents: orphaned.map(o => o.id),
    unfilledComponents: unfilled,
    cursorOutOfRange,
    targetWords: targetWords ?? null,
    shortfallPct,
  }
}
