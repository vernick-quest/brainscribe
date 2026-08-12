// lib/scaffoldProvenance.js — Lever B integration layer, Phase 1: SHADOW MODE.
//
// PURE (no Next/Supabase imports) so scripts/verify/provenance.mjs exercises the
// exact logic the lock hooks run — same pattern as lib/provenance.js itself.
//
// Phase 1 NEVER blocks a lock. It annotates UNSCORED scaffold entries with a
// provenance record and reports which locks WOULD have been flagged, so the
// threshold can be watched against real sessions before Phase 2 (hard-block,
// gated on coach-ai's full esl-drift-probes calibration) turns enforcement on.
//
// It also reports what it could NOT score. Measured 2026-08-11: 14 completed
// paragraphs carried zero provenance records while item locks in the SAME scaffolds
// carried 19 — the paragraph arm had never once fired, and because a shadow monitor
// that records nothing looks exactly like a shadow monitor with nothing to report,
// that went unnoticed. Silence is now a reportable outcome, not the absence of one.
//
// Storage contract (agreed shape for coach-ai's buildCoachSystemBlocks read —
// all inside paragraph_scaffolds.components, NO migration):
//   components[i].items[j].provenance  — component/nugget/thesis-item locks
//   components[i].provenance           — completed dictated paragraphs
//   record: { studentSimilarity, novelFraction, contentCount, pass,
//             mode:'shadow', v:1, novelWords? (only when !pass, capped 8) }
// Session aggregate is DERIVED ON READ via sessionCoachContribution(components)
// below — never stored. Persisting in the scaffold JSON is what carries
// provenance across resume (closes the resume-laundering vector).

import { checkProvenance } from './provenance'

const PROVENANCE_VERSION = 1

const round3 = n => Math.round(n * 1000) / 1000

function buildRecord(text, studentSources) {
  const r = checkProvenance(text, studentSources)
  const rec = {
    studentSimilarity: round3(r.studentSimilarity),
    novelFraction: round3(r.novelFraction),
    contentCount: r.contentCount,
    pass: r.pass,
    mode: 'shadow',
    v: PROVENANCE_VERSION,
  }
  // Novel words are (by construction) words the student never said — coach/model
  // vocabulary, not student content — kept small purely for flag debugging.
  if (!r.pass) rec.novelWords = r.novelWords.slice(0, 8)
  return rec
}

// True when the incoming components hold a lock that has not been scored yet.
// Lets the route skip the student-sources fetch on scoring-free PATCHes
// (ACTIVE/candidate/cursor updates — the common case).
//
// This asks "is anything UNSCORED?", not "did something just transition?". The
// transition phrasing is what broke the paragraph arm: measured 2026-08-11, 14
// completed paragraphs carried ZERO provenance records while item locks in the SAME
// scaffolds carried 19 — so the miss was not "it all predates the feature". A
// completion is a one-shot edge, and if its scribed text isn't readable at that exact
// moment the edge is spent, `!out.provenance` guards the retry out, and nothing logs
// it. State is re-checkable on every PATCH; an edge is not.
export function needsProvenancePass(incoming, stored = []) {
  const storedByIndex = new Map((stored ?? []).map((p, i) => [p.index ?? i, p]))
  return (incoming ?? []).some((p, i) => {
    const prev = storedByIndex.get(p.index ?? i)
    if (p.status === 'complete' && !(p.provenance || prev?.provenance)) return true
    const prevItems = new Map((prev?.items ?? []).map(it => [it.id, it]))
    return (p.items ?? []).some(
      it => it.status === 'confirmed' && !(it.provenance || prevItems.get(it.id)?.provenance)
    )
  })
}

// annotateScaffoldProvenance({ incoming, stored, paragraphTexts, studentSources })
//   incoming       — the components array the client PATCHed (persisted wholesale today)
//   stored         — the components array currently in the DB row
//   paragraphTexts — { [position]: scribed_text } for the session's persisted paragraphs
//   studentSources — the student's OWN words: raw_spoken_text of every paragraph +
//                    the session's role:'user' message turns
//
// Returns { components, checked, flagged, unscorable }:
//   components — incoming, with provenance annotated on unscored locks and prior
//                annotations carried forward (see sticky note below); safe to persist
//                in place of the client's array. NEVER drops or mutates a lock —
//                shadow mode only ever ADDS a provenance key.
//   checked    — every lock scored this call ({ kind, paraIndex, itemId?, provenance })
//   flagged    — the subset whose record has pass:false (the route logs these)
//   unscorable — locks that are complete/confirmed but had no text to score. These
//                used to vanish: the route reported success, nothing was recorded, and
//                the monitor looked healthy while watching nothing. A gap in a safety
//                signal has to be as loud as a failure of it.
//
// STICKY: the client keeps its own in-memory scaffold and PATCHes the whole
// components tree, so a later lock-free PATCH echoes entries WITHOUT the
// provenance the server added earlier. Every call therefore carries stored
// annotations forward — a wholesale client write can never wipe them.
export function annotateScaffoldProvenance({ incoming, stored = [], paragraphTexts = {}, studentSources = [] }) {
  const checked = []
  const flagged = []
  const unscorable = []
  const storedByIndex = new Map((stored ?? []).map((p, i) => [p.index ?? i, p]))

  // HARD GUARD. With no student baseline, every locked word is "novel" by
  // construction and everything scores 1.0 — a total false positive, which under
  // Phase 2 would refuse a lock the student legitimately earned. The route already
  // calls this with empty sources on its no-scoring-needed path; that path finds
  // nothing unscored today, but one caller passing the wrong argument must not be
  // able to turn the safety net into an accusation. Here the baseline is KNOWN
  // absent, not merely suspected — recording nothing is honest; scoring 1.0 is a
  // fabricated verdict.
  const hasBaseline = (Array.isArray(studentSources) ? studentSources : [studentSources])
    .some(s => String(s ?? '').trim().length > 0)

  const components = (incoming ?? []).map((p, i) => {
    const paraIndex = p.index ?? i
    const prev = storedByIndex.get(paraIndex)
    const prevItems = new Map((prev?.items ?? []).map(it => [it.id, it]))
    const out = { ...p }

    out.items = (p.items ?? []).map(item => {
      const prevItem = prevItems.get(item.id)
      if (!item.provenance && prevItem?.provenance) {
        item = { ...item, provenance: prevItem.provenance }
      }
      // STATE, not edge (see needsProvenancePass): score any confirmed item that has
      // no record yet, so a lock whose text wasn't readable on the transition PATCH
      // still gets scored on the next one instead of being lost forever.
      const text = item.text || item.nuggetText
      if (item.status === 'confirmed' && !item.provenance) {
        if (text && hasBaseline) {
          const rec = buildRecord(text, studentSources)
          item = { ...item, provenance: rec }
          const entry = { kind: 'component', paraIndex, itemId: item.id, provenance: rec }
          checked.push(entry)
          if (!rec.pass) flagged.push(entry)
        } else {
          unscorable.push({
            kind: 'component', paraIndex, itemId: item.id,
            reason: text ? 'no student baseline' : 'no text',
          })
        }
      }
      return item
    })

    // Paragraph completion (dictated prose): the locked text is the persisted
    // scribed paragraph — its raw_spoken_text (in studentSources) is the baseline.
    if (!out.provenance && prev?.provenance) out.provenance = prev.provenance
    const paraText = paragraphTexts?.[paraIndex]
    if (p.status === 'complete' && !out.provenance) {
      if (paraText && hasBaseline) {
        const rec = buildRecord(paraText, studentSources)
        out.provenance = rec
        const entry = { kind: 'paragraph', paraIndex, provenance: rec }
        checked.push(entry)
        if (!rec.pass) flagged.push(entry)
      } else {
        // The measured failure: the scribed paragraph row was not readable when the
        // completion arrived. Previously silent AND permanent — the edge was spent.
        // Now it stays unscored (so the next PATCH retries) and says so.
        unscorable.push({
          kind: 'paragraph', paraIndex,
          reason: paraText ? 'no student baseline' : 'no scribed text',
        })
      }
    }

    return out
  })

  return { components, checked, flagged, unscorable }
}

// Session-aggregate coach-contribution ratio — DERIVED ON READ, never stored.
// This is the field coach-ai surfaces in CURRENT SCAFFOLD STATE (via
// buildCoachSystemBlocks): import { sessionCoachContribution } from
// '@/lib/scaffoldProvenance' and pass scaffold.components.
//
// Weighted by contentCount so a 40-word paragraph counts more than a 3-word
// hook. Where a paragraph has BOTH its own record and item records, the
// paragraph record wins (it scores the final locked text; counting its items
// too would double-count the same words).
export function sessionCoachContribution(components = []) {
  let words = 0
  let novel = 0
  let checkedCount = 0
  let flaggedCount = 0
  for (const p of components ?? []) {
    const records = p.provenance
      ? [p.provenance]
      : (p.items ?? []).map(it => it.provenance).filter(Boolean)
    for (const rec of records) {
      checkedCount++
      if (!rec.pass) flaggedCount++
      words += rec.contentCount
      novel += rec.novelFraction * rec.contentCount
    }
  }
  return {
    checkedCount,
    flaggedCount,
    coachContribRatio: words ? round3(novel / words) : 0,
  }
}
