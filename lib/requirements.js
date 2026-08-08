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

// Display state for one target chip: { full, short, met }.
// `full` is shown on sm+; `short` is the compact mobile form.
export function chipState(target, actual = {}) {
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
  const goalDisplay = (min != null && max != null) ? `${min}–${max}` : String(max ?? min ?? single ?? '?')
  const goalNum = String(max ?? single ?? min ?? '?')
  return isPara
    ? { full: `${n} / ${goalDisplay} paragraphs`, short: `${n}/${goalNum}¶`, met }
    : { full: `${n} / ${goalDisplay} words`, short: `${n}/${goalNum}w`, met }
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

  const chip = chipState(target, actual)
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
