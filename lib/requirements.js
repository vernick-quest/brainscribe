// Assignment requirement metrics — shared by the client (live progress chip),
// the coach prompt builder, and the API routes that persist actual progress.
// Pure functions only (its one import, lib/wordCountTargets.js, is pure too) so
// this is safe to import from both client components and server routes.
//
// requirements shape on a session row:
//   { targets: [{type:'words',min,max,label} | {type:'paragraphs',target,label}
//               | {type:'chars',max,label}],
//     actual:  { words, paragraphs } }

import { recommendedForTarget, targetProgress, targetLabel } from './wordCountTargets.js'
import { isDraftShapedScaffold } from './startingDraftScaffold.js'

export function countWords(text) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

// Actual progress from the student's written paragraphs.
export function computeActual(paragraphs) {
  const list = Array.isArray(paragraphs) ? paragraphs : []
  const withText = list.filter(p => p?.scribed_text && p.scribed_text.trim())
  const words = withText.reduce((sum, p) => sum + countWords(p.scribed_text), 0)
  return { words, paragraphs: withText.length }
}

// The WIP draft's locked text lines from a scaffold's components tree. Mirrors
// the transcript's `scaffoldLines`: each item contributes its final text
// (`.text`) or dictated nugget (`.nuggetText`); unreached/locked items have
// neither and drop out. Safe on any shape (missing/!array → []).
export function scaffoldDraftLines(components) {
  const list = Array.isArray(components) ? components : []
  return list
    .flatMap(sec => (Array.isArray(sec?.items) ? sec.items : []))
    .filter(it => it && (it.text || it.nuggetText))
    .map(it => it.text || it.nuggetText)
}

// Draft-aware progress, for watcher-facing WIP readouts. Prefers assembled
// paragraphs (the durable, prose-assembled source); when none exist yet — early
// WIP where the student has locked components but no paragraph is assembled — it
// falls back to the scaffold's locked items so the running word count reflects
// in-progress work instead of reading 0. This mirrors the transcript essay's own
// `paragraphs.length ? paragraphs : scaffoldLines` fallback, so the count always
// matches the draft shown. Paragraph count stays paragraphs-only (a scaffold-only
// WIP legitimately has 0 assembled paragraphs). Does NOT change computeActual's
// paragraphs-only semantics — callers that must stay paragraphs-only keep using it.
export function computeActualFromDraft(paragraphs, scaffoldComponents) {
  const fromParas = computeActual(paragraphs)
  if (fromParas.words > 0 || fromParas.paragraphs > 0) return fromParas
  const lines = scaffoldDraftLines(scaffoldComponents)
  if (lines.length === 0) return fromParas // { words: 0, paragraphs: 0 }
  const words = lines.reduce((sum, line) => sum + countWords(line), 0)
  return { words, paragraphs: fromParas.paragraphs }
}

// ── A stated MINIMUM is a requirement; the recommended range is advice ─────────
//
// 2026-10-11: a student's assignment said 350–500 words. The coach spoke only of the
// RECOMMENDED range (440–470), called a 177-word draft "a bit under", said "No pressure
// if it feels complete as is", and the session closed. The range is a nudge (Rule 14a);
// the minimum is the assignment's own floor, and nothing in the prompt said so.
//
// The stated minimum of a WORDS target, or null. An exact count ("250 words", parsed as
// min === max) has a minimum too: the stated number. Character and paragraph targets have
// none here — a character target only ever carries a max, and paragraph counts are not
// word floors.
export function statedWordMinimum(target) {
  if (!target || target.type !== 'words') return null
  const n = typeof target.min === 'string' ? Number(target.min) : target.min
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

// How many sections a word target needs, for scaffold sizing (Rule 2).
//
// A section of the scaffold comes out at roughly one student paragraph. 100 words is a
// PLANNING figure, not a measurement — middle-school paragraphs run ~80–150 — and it is
// sized against the bottom of the recommended range when there is one (that is what the
// coach is told to aim for), else the stated minimum. Round to nearest, never below 1:
// a 150-word short answer is one section, not two.
//
// The motivating case: 350–500 words scaffolded as ONE personal_statement section of four
// components. Every component was locked and the piece was 177 words — the structure
// itself could not reach the floor, however well each part was written.
export const PLANNING_WORDS_PER_SECTION = 100
export function sectionsForWordTarget(target, opts = {}) {
  if (!target || (target.type !== 'words' && target.type !== 'chars')) return null
  const rec = recommendedForTarget(target, opts)
  const floor = rec?.low ?? statedWordMinimum(target)
  if (!floor) return null
  return Math.max(1, Math.round(floor / PLANNING_WORDS_PER_SECTION))
}

// Can the scaffold the coach already emitted plausibly reach the stated minimum?
//
// Deliberately GENEROUS (175 words per prose section) so it only fires when the shape is
// clearly too small — a false alarm here would have the coach pushing a student to add a
// section they don't need. Custom scaffolds are skipped: their sections are not
// paragraphs (a haiku's three lines are one section), so section count says nothing about
// length. Returns null when there is nothing to judge.
export const GENEROUS_WORDS_PER_SECTION = 175
export function scaffoldTooSmallForMinimum(target, components) {
  const min = statedWordMinimum(target)
  const sections = Array.isArray(components) ? components : []
  if (!min || sections.length === 0) return null
  // A starting-draft scaffold is all one-part custom sections, each holding a whole PARAGRAPH,
  // so section count does say something about length there. Skipping it (round-2 review #5)
  // removed the warning from exactly the students most likely to be under target.
  if (sections.some(s => s?.type === 'custom') && !isDraftShapedScaffold({ components: sections })) return null
  const capacity = sections.length * GENEROUS_WORDS_PER_SECTION
  return capacity < min ? { sections: sections.length, capacity, min } : null
}

// ── The count the COACH is held to: what the finished Draft will actually contain ────
//
// Why not computeActualFromDraft: it is all-or-nothing — the moment ONE paragraphs row
// exists it counts rows only. But rows are written only when a student taps "Assemble
// paragraph" (or dictates); [PARA_DONE] marks a section complete WITHOUT one. So a student
// who assembled section 1 and not sections 2–4 reads as section 1's words alone. That was
// a display undercount; once the count GATES completion (Rule 12) it becomes the coach
// telling a student who has met the minimum that they are 200 words short.
//
// This mirrors /api/sessions/[id]/complete exactly — the code that builds the final Draft:
// a section with a row (matched on paragraph_index ?? position) contributes the row; a
// section without one contributes its CONFIRMED components (the same filter completion
// assembles from — a coach-suggested candidate never counts). Rows that map to no section
// (a continuation's dictated addition) are real text and are added. Assembly of a prose
// section can shift its word count slightly; the row, once it exists, is the truth.
export function computeActualLive(paragraphs, scaffoldComponents) {
  const rows = Array.isArray(paragraphs) ? paragraphs : []
  const sections = Array.isArray(scaffoldComponents) ? scaffoldComponents : []
  const rowIndex = r => r?.paragraph_index ?? r?.position
  const byIndex = new Map()
  for (const r of rows) {
    const i = rowIndex(r)
    if (Number.isInteger(i) && !byIndex.has(i)) byIndex.set(i, r)
  }
  let words = 0
  let paragraphs_ = 0
  sections.forEach((sec, i) => {
    const n = byIndex.has(i)
      ? countWords(byIndex.get(i)?.scribed_text)
      : (sec?.items ?? [])
          .filter(c => c?.status === 'confirmed' && (c.text || c.nuggetText))
          .reduce((sum, c) => sum + countWords(c.text || c.nuggetText), 0)
    words += n
    if (n > 0) paragraphs_++
  })
  // Rows that belong to no section: index past the scaffold, or no usable index at all.
  // (A second row for an in-range index was already accounted for by that section.)
  for (const r of rows) {
    const i = rowIndex(r)
    if (Number.isInteger(i) && i < sections.length) continue
    const n = countWords(r?.scribed_text)
    words += n
    if (n > 0) paragraphs_++
  }
  return { words, paragraphs: paragraphs_ }
}

// Display state for one target chip: { full, short, met }.
// `full` is shown on sm+; `short` is the compact mobile form.
export function chipState(target, actual = {}, opts = {}) {
  if (!target || typeof target !== 'object') return null
  actual = actual || {} // guard explicit null (default only applies to undefined)

  // A CHARACTER limit must never fall through to the words branch below: `max` is a
  // count of CHARACTERS, so a 1,600-character assignment rendered as "250 / 1600
  // words" — a goal roughly six times the real ceiling, on the student's folder and
  // on both watcher dashboards. Show the word equivalent, which is what we actually
  // measure. (targetDisplay has a richer version of this; chipState is the one the
  // dashboards still call directly.)
  if (target.type === 'chars') {
    const rec = recommendedForTarget(target)
    if (!rec) return null
    const n = actual.words ?? 0
    return { full: `${n} / ~${rec.high} words`, short: `${n}/~${rec.high}w`, met: n >= rec.low }
  }

  const isPara = target.type === 'paragraphs'
  const n = isPara ? (actual.paragraphs ?? 0) : (actual.words ?? 0)
  const min = typeof target.min === 'number' ? target.min : null
  const max = typeof target.max === 'number' ? target.max : null
  const single = typeof target.target === 'number' ? target.target : null
  const floor = min ?? single // the number to reach for "met"
  const met = floor != null ? n >= floor : (max != null ? n > 0 && n <= max : false)
  // ── What the goal actually reads as ────────────────────────────────────────
  // Two problems with the old one-liner, both live on real cards:
  //   1. `${min}–${max}` printed "250–250" whenever an assignment states one exact
  //      count. The parse legitimately produces min===max for "250 words", and three
  //      sessions in production render that way today.
  //   2. A bare "207 / 250 words" doesn't say whether 250 is a floor or a ceiling —
  //      opposite meanings, identical display. A student under a MINIMUM has work
  //      left; a student under a MAXIMUM may be finished.
  // So: collapse an exact count, and name the bound when there is only one of them.
  const exact = min != null && max != null && min === max
  const goalDisplay = exact ? String(min)
    : (min != null && max != null) ? `${min}–${max}`
    : String(max ?? min ?? single ?? '?')
  const goalNum = String(max ?? single ?? min ?? '?')
  // Only ambiguous when a single bound is stated. A range and an exact count both
  // speak for themselves, and paragraph targets are always a plain count. Callers
  // that render the fuller "Target: 400–450 · Max: 500" line underneath pass
  // qualifyBound:false — there the "(max)" is just the same word twice.
  const bound = (opts.qualifyBound === false || isPara || exact || (min != null && max != null)) ? ''
    : max != null ? ' (max)'
    : min != null ? ' (min)'
    : ''
  return isPara
    ? { full: `${n} / ${goalDisplay} paragraphs`, short: `${n}/${goalNum}¶`, met }
    : { full: `${n} / ${goalDisplay} words${bound}`, short: `${n}/${goalNum}w`, met }
}

// One target, everything a surface needs to render it: the neutral count chip AND
// the Rule 14a recommended range, computed together so the live session, the
// dashboard, and the watcher transcript cannot show three different numbers — and
// so none of them differs from what the coach says out loud (lib/prompts.js builds
// its line from the same recommendedForTarget).
//
// `opts.assignmentType` comes from paragraph_scaffolds.assignment_type when it
// exists; absent, the default band applies. Returns chipState's fields plus:
//   range  — { low, high, center, basis } or null when no ceiling is stated
//   label  — "Target: 420–480 · Max: 500", or null
//   zone   — 'below' | 'in' | 'over' | 'over-max'
//   fill   — 0..1 against the BOTTOM of the range (never rendered as a percentage)
export function targetDisplay(target, actual = {}, opts = {}) {
  const range = recommendedForTarget(target, opts)
  const n = (actual || {}).words ?? 0

  // A CHARACTER limit has no character-level `actual` to compare against — we only
  // ever count words. Show the word equivalent so the student isn't asked to think
  // in characters, and measure against that.
  if (target?.type === 'chars') {
    if (!range) return null
    return {
      full: `${n} / ~${range.high} words`,
      short: `${n}/~${range.high}w`,
      met: n >= range.low,
      range,
      label: `Target: ${range.low}–${range.high} words · Limit: ${target.max} characters`,
      // Ceiling = the word equivalent of the character limit. Passing null here meant
      // 'over-max' could NEVER fire for a character-limited piece: a student at double
      // the limit saw amber and was never told they were over. The equivalence is
      // approximate (6 chars/word), so this is a warning, not a measurement — but the
      // honest failure is "flagged slightly early", not "never flagged".
      ...targetProgress(n, range, range.high),
    }
  }

  // qualifyBound:false — this surface renders "Target: 400–450 · Max: 500"
  // underneath, so a "(max)" on the count line is the same word twice.
  const chip = chipState(target, actual, { qualifyBound: false })
  if (!chip) return null
  const max = typeof target?.max === 'number' ? target.max : null
  const progress = targetProgress(n, range, max)
  return { ...chip, range, label: targetLabel(range, max), ...progress }
}

// Server helper: recompute actual from the session's paragraphs and persist it
// back onto sessions.requirements. No-op when the session has no requirements
// (or the column doesn't exist yet — fails closed, never throws to the caller).
// Pass any Supabase client that can read/write this session under RLS.
export async function persistRequirementsActual(supabase, sessionId) {
  if (!sessionId) return
  try {
    const { data: session, error } = await supabase
      .from('sessions').select('requirements').eq('id', sessionId).single()
    if (error) return
    const reqs = session?.requirements
    if (!reqs) return
    // Previously returned early when `targets` was empty, so `actual` stayed at its
    // creation value of {words:0} forever. A stored count that is never recomputed is a
    // lie waiting to be displayed — and it was: completed sessions sat at 0 words.
    // The count is cheap and useful regardless of whether a target exists to compare it to.

    const { data: paragraphs, error: pErr } = await supabase
      .from('paragraphs').select('scribed_text').eq('session_id', sessionId)
    // Don't clobber a good actual with zeros on a transient read failure.
    if (pErr) return

    // Non-prose finals (a letter, a haiku) can live in the scaffold with no paragraph
    // rows — counting paragraphs alone reported 0 for work plainly on screen. Use the
    // draft-aware helper that ALREADY mirrors the transcript's own precedence, rather
    // than a second implementation that can drift away from it.
    // Same contract as pErr above: a transient read failure must not be turned into a
    // persisted zero. Asymmetric error handling next to a comment forbidding exactly this
    // is how a good count gets clobbered.
    const { data: sc, error: sErr } = await supabase
      .from('paragraph_scaffolds').select('components').eq('session_id', sessionId).maybeSingle()
    if (sErr) return
    const actual = computeActualFromDraft(paragraphs, sc?.components)
    await supabase.from('sessions')
      .update({ requirements: { ...reqs, actual } })
      .eq('id', sessionId)
  } catch (e) {
    console.error('[persistRequirementsActual] skipped:', e?.message)
  }
}
