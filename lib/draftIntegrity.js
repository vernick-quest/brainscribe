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
// signal 2 is now reported ONLY when the scaffold is itself the Final Draft (no paragraph
// rows) — there an empty slot is a visible hole in what the student reads back. Once
// paragraph rows exist they are what renders, and an empty scaffold slot means nothing.
//
// ── The word target is a CEILING, not a floor (Robert, 2026-07-28) ────────────────────
// Assignments read "up to 500 words". A student who writes 273 of them has made a choice,
// not suffered a fault, so a shortfall is NOT a flag — it stays in the payload as context
// on rows flagged for a real reason. What this module watches for is the DISCONNECT
// between the working draft and the Final Draft, nothing else.
//
//   4. BROKEN COMMITMENTS — the coach emitted [DONE:body] (a promise that the body was
//      saved) and no text exists for that component anywhere the student can see it.
//      Recorded SERVER-side in /api/tutor from the raw stream; the student's writing is
//      saved CLIENT-side. Two independent paths, so a dropped write cannot also drop its
//      own evidence. See lib/coachCommitments.js. This is the signal that replaced the
//      word-count heuristic, and unlike signal 3 it needs no theory about HOW a write
//      fails — only that one was owed. It would have caught BOTH known bugs, and stays
//      correctly silent on Lyndsay, whose coach never promised a roadmap.

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
const countWords = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length

// Fraction of an orphan's content words that already survive in the rendered draft. The
// >3-char filter drops "the/and/was", which otherwise match everywhere and make any two
// English sentences look related.
function survivalRatio(text, finalNorm) {
  const words = norm(text).split(' ').filter(w => w.length > 3)
  if (!words.length) return 1
  return words.filter(w => finalNorm.includes(w)).length / words.length
}

// How much of this orphan is ACTUALLY absent from the Final Draft, measured per sentence.
//
// ── Why not just count the whole item (found 2026-08-04) ──────────────────────────────
// Baron's Gratitude Letter reported "Final draft 31w · working draft 182w · 151w missing".
// 31 + 151 = 182, but the 151w component CONTAINED that 31w opening sentence in revised
// form ("a thing"->"a tool", "understand"->"comprehend"), so the shared sentence was
// counted twice and the loss overstated. Restoring produced 151w, not 182w — the restore
// contradicted the alert by exactly the overlap, and a human caught it, not the tooling.
//
// Severity on this screen drives whether someone drops everything. It has to be true.
const SENTENCE_SPLIT = /(?<=[.!?])\s+/
export function missingWords(text, finalNorm) {
  const sentences = String(text || '').split(SENTENCE_SPLIT).filter(x => x.trim())
  return sentences
    .filter(sent => survivalRatio(sent, finalNorm) < 0.6)   // same tolerance as the orphan test
    .reduce((n, sent) => n + countWords(sent), 0)
}

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
  const {
    currentParagraphIndex = null, status = null, targetWords = null,
    brokenCommitments = [],
  } = opts

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
    return survivalRatio(v, finalNorm) < 0.6
  })
  // Count only what is genuinely ABSENT, sentence by sentence — an orphan that partly
  // overlaps the draft must not have its shared sentences counted as missing.
  const orphanedWords = orphaned.reduce((n, it) => n + missingWords(it.value, finalNorm), 0)

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
  // The coach promised these were saved and they are nowhere the student can see them.
  // Provable loss, no inference — always alert.
  if (brokenCommitments.length > 0) {
    reasons.push(
      `the coach said ${brokenCommitments.length} component(s) were locked in but nothing ` +
      `was saved for them: ${brokenCommitments.join(', ')}`
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
  // The word target is a CEILING ("up to 500 words"), not a floor. A student who writes
  // less than the maximum has made a choice, not suffered a fault, so a shortfall is not
  // a flag — it's context shown on rows flagged for a real reason. What this module is
  // for is the DISCONNECT between the working draft and the Final Draft.
  const noEvidenceOfLoss =
    renderedFromParagraphs && orphanedWords === 0 && droppedComponents.length === 0

  if (isComplete && unfilled.length > 0 && droppedComponents.length === 0 && !noEvidenceOfLoss) {
    reasons.push(
      `finished with ${unfilled.length} empty component(s): ${unfilled.join(', ')}` +
      (renderedFromParagraphs
        // Don't imply loss when the draft doesn't render from the scaffold at all.
        ? ' — the Final Draft renders from paragraph rows, so these may simply be unused slots'
        : ' — content coached for these may never have been saved')
    )
    // Reaching here means the scaffold IS the Final Draft (no paragraph rows), so an
    // empty slot is a visible hole in what the student reads back — worth a look, never
    // an alert on its own.
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
    // finalWords + what's genuinely absent. Never a naive sum of two overlapping texts.
    workingWords: finalWords + orphanedWords,
    orphanedWords,
    orphanedComponents: orphaned.map(o => o.id),
    unfilledComponents: unfilled,
    droppedComponents,
    brokenCommitments,
    renderedFromParagraphs,
    cursorOutOfRange,
    targetWords: targetWords ?? null,
    shortfallPct,
  }
}
