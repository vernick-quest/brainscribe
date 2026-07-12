// lib/scaffoldProvenance.js — Lever B integration layer, Phase 1: SHADOW MODE.
//
// PURE (no Next/Supabase imports) so scripts/verify/provenance.mjs exercises the
// exact logic the lock hooks run — same pattern as lib/provenance.js itself.
//
// Phase 1 NEVER blocks a lock. It annotates newly-locked scaffold entries with a
// provenance record and reports which locks WOULD have been flagged, so the
// threshold can be watched against real sessions before Phase 2 (hard-block,
// gated on coach-ai's full esl-drift-probes calibration) turns enforcement on.
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

// True when the incoming components contain a lock the stored copy doesn't:
// an item newly status:'confirmed' or a paragraph newly status:'complete'.
// Lets the route skip the student-sources fetch on lock-free PATCHes
// (ACTIVE/candidate/cursor updates — the common case).
export function hasNewLocks(incoming, stored = []) {
  const storedByIndex = new Map((stored ?? []).map((p, i) => [p.index ?? i, p]))
  return (incoming ?? []).some((p, i) => {
    const prev = storedByIndex.get(p.index ?? i)
    if (p.status === 'complete' && prev?.status !== 'complete') return true
    const prevItems = new Map((prev?.items ?? []).map(it => [it.id, it]))
    return (p.items ?? []).some(
      it => it.status === 'confirmed' && prevItems.get(it.id)?.status !== 'confirmed'
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
// Returns { components, checked, flagged }:
//   components — incoming, with provenance annotated on newly-locked entries and
//                prior annotations carried forward (see sticky note below); safe to
//                persist in place of the client's array. NEVER drops or mutates a
//                lock — shadow mode only ever ADDS a provenance key.
//   checked    — every lock scored this call ({ kind, paraIndex, itemId?, provenance })
//   flagged    — the subset whose record has pass:false (the route logs these)
//
// STICKY: the client keeps its own in-memory scaffold and PATCHes the whole
// components tree, so a later lock-free PATCH echoes entries WITHOUT the
// provenance the server added earlier. Every call therefore carries stored
// annotations forward — a wholesale client write can never wipe them.
export function annotateScaffoldProvenance({ incoming, stored = [], paragraphTexts = {}, studentSources = [] }) {
  const checked = []
  const flagged = []
  const storedByIndex = new Map((stored ?? []).map((p, i) => [p.index ?? i, p]))

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
      const newlyConfirmed = item.status === 'confirmed' && prevItem?.status !== 'confirmed'
      const text = item.text || item.nuggetText
      if (newlyConfirmed && text && !item.provenance) {
        const rec = buildRecord(text, studentSources)
        item = { ...item, provenance: rec }
        const entry = { kind: 'component', paraIndex, itemId: item.id, provenance: rec }
        checked.push(entry)
        if (!rec.pass) flagged.push(entry)
      }
      return item
    })

    // Paragraph completion (dictated prose): the locked text is the persisted
    // scribed paragraph — its raw_spoken_text (in studentSources) is the baseline.
    if (!out.provenance && prev?.provenance) out.provenance = prev.provenance
    const newlyComplete = p.status === 'complete' && prev?.status !== 'complete'
    const paraText = paragraphTexts?.[paraIndex]
    if (newlyComplete && paraText && !out.provenance) {
      const rec = buildRecord(paraText, studentSources)
      out.provenance = rec
      const entry = { kind: 'paragraph', paraIndex, provenance: rec }
      checked.push(entry)
      if (!rec.pass) flagged.push(entry)
    }

    return out
  })

  return { components, checked, flagged }
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
