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
//
//   3. RECORDED DROPS — an item the client marked `writeDropped` because a [DONE:…]
//      arrived with nothing to save (see resolveDoneText in lib/scaffoldWrite.js). This
//      is the only signal that is a FACT rather than an inference, so it always alerts.
//
// ── Why signal 2 alone over-reports (learned 2026-07-28) ──────────────────────────────
// An empty component means "nobody wrote here". It does NOT distinguish:
//   (a) a write that was dropped        — real loss, and
//   (b) a component the coach chose to skip — completely legitimate.
// Lyndsay Pearson's 2026-07-27 quick write was flagged ALERT with `roadmap` and
// `thesis_restate` empty. The transcript shows the coach saying "since this is a two
// paragraph quick write, we don't really need a roadmap — the thesis does enough work on
// its own." Nothing was lost; every word she confirmed is in her draft. Meanwhile a
// RESTORED session also keeps empty scaffold slots, because the restored prose lives in
// the paragraph rows the draft actually renders from — so the fix itself created new
// false alarms.
// A detector that cries wolf on healthy sessions gets ignored on the one that matters, so
// signal 2 now only reaches ALERT with corroboration (a recorded drop, orphaned text, or
// a large shortfall against a real target). On its own it is a WARN.

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
  const unfilledItems = (components ?? []).flatMap((sec, i) =>
    (sec.items ?? [])
      .filter(it => !(it.text || it.nuggetText))
      .map(it => ({ label: `p${i}:${it.id}`, writeDropped: it.writeDropped === true }))
  )
  const unfilled = unfilledItems.map(it => it.label)

  // --- Signal 3: drops the client actually recorded (a fact, not an inference) --------
  const droppedComponents = unfilledItems.filter(it => it.writeDropped).map(it => it.label)

  // Where does the Final Draft actually come from? When paragraph rows exist the
  // transcript renders those and ignores the scaffold entirely, so empty scaffold slots
  // say nothing about what the student can see. Restored sessions live here.
  const renderedFromParagraphs = (paragraphs?.length ?? 0) > 0

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
  // A recorded drop is not a guess — the client watched a lock-in fail. Always alert.
  if (droppedComponents.length > 0) {
    reasons.push(
      `${droppedComponents.length} component(s) recorded a DROPPED lock-in: ` +
      `${droppedComponents.join(', ')} — the coach told the student these were saved and ` +
      `they were not`
    )
    severity = 'alert'
  }

  const bigShortfall = isComplete && shortfallPct !== null && shortfallPct >= 30

  // An empty slot with NO corroborating evidence at all — the draft renders from
  // paragraph rows (so the scaffold isn't even the source), nothing is orphaned, no drop
  // was recorded, and there's no word target to fall short of — is not evidence of
  // anything. Both remaining cases on 2026-07-28 were exactly this shape: Lyndsay's
  // coach-skipped roadmap, and the sessions we had just repaired (restored prose lives in
  // the paragraph rows, leaving the old scaffold slots empty forever).
  //
  // Reporting those keeps a permanent, unfixable entry on the alert screen, which is how
  // a monitor stops being read. The safety net that replaces it is stronger anyway: a
  // recorded `writeDropped`, and the student's own report.
  const noEvidenceOfLoss =
    renderedFromParagraphs && orphanedWords === 0 && droppedComponents.length === 0 && targetWords === null

  if (isComplete && unfilled.length > 0 && droppedComponents.length === 0 && !noEvidenceOfLoss) {
    reasons.push(
      `finished with ${unfilled.length} empty component(s): ${unfilled.join(', ')}` +
      (renderedFromParagraphs
        // Don't imply loss when the draft doesn't render from the scaffold at all.
        ? ' — the Final Draft renders from paragraph rows, so these may simply be unused slots'
        : ' — content coached for these may never have been saved')
    )
    // Corroboration required: on its own an empty slot is as likely to be a component the
    // coach deliberately skipped. Paired with a big shortfall against a REAL target it's
    // the 2026-07-20 shape (74w of a 250w essay, two slots empty).
    //
    // The shortfall — not renderedFromParagraphs — is what separates the cases. Baron's
    // lost session had a paragraph row too, so gating on that would have re-hidden the
    // exact loss this module was written for.
    if (bigShortfall) severity = 'alert'
    else if (severity === 'none') severity = 'warn'
  }
  if (bigShortfall) {
    reasons.push(`Final Draft is ${shortfallPct}% under the ${targetWords}-word target (${finalWords}w)`)
    if (severity === 'none') severity = 'warn'
  }
  // NOTE: cursor past the last section is the NORMAL "all paragraphs done" sentinel, so it
  // is reported as context only. It fires on every healthy completed session and must
  // never escalate severity on its own — that was a pure false-positive generator.
  if (cursorOutOfRange && unfilled.length > 0) {
    reasons.push(
      `scaffold cursor (${currentParagraphIndex}) is past the last section (${sectionCount}) ` +
      `while components are still empty (normal at completion; noted for context)`
    )
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
    droppedComponents,
    renderedFromParagraphs,
    cursorOutOfRange,
    targetWords: targetWords ?? null,
    shortfallPct,
  }
}
