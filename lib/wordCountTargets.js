// lib/wordCountTargets.js — "what does good look like?" when the assignment only
// states a ceiling.
//
// Most assignments give a MAXIMUM and nothing else. "No more than 500 words" leaves
// the student guessing whether 200 is fine or whether they're expected to get close.
// For an ADHD student especially, an open range is harder to work toward than a
// concrete one: "somewhere under 500" has no finish line, "aim for 420–480" does.
//
// This module turns a stated ceiling into a RECOMMENDED RANGE. It is a nudge, never
// a gate — nothing in the app blocks, warns, or withholds completion for a student
// who lands under it (see Rule 14a in lib/prompts.js: under-target is framed as
// opportunity, and the student decides).
//
// ── Why DERIVED and not stored ────────────────────────────────────────────────
// The spec called for target_words_low/high columns computed at assignment creation.
// This codebase can't do that correctly:
//   • There is no `assignments` table — numeric targets live in sessions.requirements
//     JSONB (migration 017), so a stored range would need its own migration, applied
//     by hand, for a value that is a pure function of data already in the row.
//   • assignment_type lives on paragraph_scaffolds and is written when the coach
//     emits [SCAFFOLD:type:…] — AFTER the session is created. Computing at creation
//     would stamp 'default' onto every session and never revisit it, so a personal
//     statement would silently carry the essay band forever.
// So: ONE pure function, imported by the coach prompt builder AND every UI surface.
// Two callers can't drift when neither one stores anything.

// Target band as a fraction of the stated maximum, by assignment type.
// Bands are deliberately a RANGE, not a point: a single number reads as a quota.
export const TARGET_PERCENTAGES = {
  personal_statement: { low: 0.90, high: 0.95 }, // readers expect the space to be used
  essay:              { low: 0.80, high: 0.90 }, // developed without padding or risking the ceiling
  narrative:          { low: 0.80, high: 0.90 },
  short_answer:       { low: 0.90, high: 1.00 }, // applied when max <= 250 — the limit is already tight
  timed:              { low: 0.75, high: 0.80 }, // time pressure is a legitimate constraint
  custom:             { low: 0.80, high: 0.90 },
  other:              { low: 0.80, high: 0.90 }, // a real paragraph_scaffolds.assignment_type value
  default:            { low: 0.80, high: 0.90 },
}

// A stated max at or below this is treated as a short answer regardless of type.
export const SHORT_ANSWER_MAX = 250

// Character limits: ~5 characters + 1 space. Only ever used to give the student an
// APPROXIMATE word equivalent — students think in words, not characters.
export const CHARS_PER_WORD = 6

// Character prompts at or under this are tight enough to treat as a short answer.
export const SHORT_CHAR_LIMIT = 2000

// Coerce a JSONB-sourced number. Anything not a finite positive number is "absent"
// — fails CLOSED to "no target", never to a guessed one.
function positiveNumber(v) {
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) && n > 0 ? n : null
}

function bandFor(assignmentType, { isTimedMode = false, maxWords = null } = {}) {
  if (isTimedMode) return TARGET_PERCENTAGES.timed
  if (maxWords != null && maxWords <= SHORT_ANSWER_MAX) return TARGET_PERCENTAGES.short_answer
  return TARGET_PERCENTAGES[assignmentType] || TARGET_PERCENTAGES.default
}

/**
 * Recommended word-count range for an assignment.
 *
 * @returns {{ low: number, high: number, center: number, basis: string } | null}
 *   null when there is no ceiling to reason from — the caller must then say NOTHING
 *   about length. Inventing a target for an assignment that states none is worse
 *   than staying quiet.
 *
 * `basis` names which rule produced the range, for tests and for the admin view.
 */
export function getRecommendedWordTarget({
  maxWords = null,
  minWords = null,
  assignmentType = 'default',
  isTimedMode = false,
} = {}) {
  const max = positiveNumber(maxWords)
  const min = positiveNumber(minWords)

  // No ceiling → no target. A stated MINIMUM alone is a floor, not a target: the
  // assignment has already told the student what good looks like at the bottom, and
  // there is no ceiling to reason a top from.
  if (max == null) return null

  // An exact count ("write exactly 400 words", or a parse that produced min === max).
  // The spec's formula fell through to the percentage branch here and would have
  // recommended 320–360 for a 400-word requirement — advising the student to MISS a
  // count the assignment states outright. The target is the number.
  if (min != null && min >= max) {
    return { low: max, high: max, center: max, basis: 'exact' }
  }

  // Both stated: aim ~70% of the way from the floor toward the ceiling. Landing in
  // the upper-middle of an explicit range reads as thorough without risking the top.
  if (min != null) {
    const center = Math.round(min + (max - min) * 0.70)
    const spread = Math.round((max - min) * 0.10)
    return {
      low: Math.max(min, center - spread),
      high: Math.min(max, center + spread),
      center,
      basis: 'range',
    }
  }

  // Ceiling only: apply the band for this assignment type.
  const pct = bandFor(assignmentType, { isTimedMode, maxWords: max })
  const low = Math.round(max * pct.low)
  const high = Math.min(max, Math.round(max * pct.high))
  return { low, high, center: Math.round((low + high) / 2), basis: 'percentage' }
}

/**
 * Recommended range for a CHARACTER limit (e.g. a 1,600-character community essay).
 * Same band logic, plus an approximate word equivalent — the student is told words.
 *
 * @returns {{ lowChars, highChars, approxLowWords, approxHighWords } | null}
 */
export function getRecommendedCharTarget({ maxChars = null, assignmentType = 'default', isTimedMode = false } = {}) {
  const max = positiveNumber(maxChars)
  if (max == null) return null

  const pct = isTimedMode
    ? TARGET_PERCENTAGES.timed
    : max <= SHORT_CHAR_LIMIT
      ? TARGET_PERCENTAGES.short_answer
      : (TARGET_PERCENTAGES[assignmentType] || TARGET_PERCENTAGES.default)

  const lowChars = Math.round(max * pct.low)
  const highChars = Math.min(max, Math.round(max * pct.high))
  return {
    lowChars,
    highChars,
    approxLowWords: Math.round(lowChars / CHARS_PER_WORD),
    approxHighWords: Math.round(highChars / CHARS_PER_WORD),
  }
}

/**
 * The recommended range for ONE requirements target item (the shape stored in
 * sessions.requirements.targets). Returns null for paragraph targets, for a
 * min-only target, and for anything malformed.
 *
 * This is the single entry point every caller should use — the prompt builder and
 * all three UI surfaces — so the number the coach says out loud is by construction
 * the number on screen.
 */
export function recommendedForTarget(target, { assignmentType = 'default', isTimedMode = false } = {}) {
  if (!target || typeof target !== 'object') return null

  if (target.type === 'chars') {
    const chars = getRecommendedCharTarget({ maxChars: target.max, assignmentType, isTimedMode })
    if (!chars) return null
    return {
      low: chars.approxLowWords,
      high: chars.approxHighWords,
      center: Math.round((chars.approxLowWords + chars.approxHighWords) / 2),
      basis: 'chars',
      chars,
    }
  }

  if (target.type !== 'words') return null
  return getRecommendedWordTarget({
    maxWords: target.max,
    minWords: target.min,
    assignmentType,
    isTimedMode,
  })
}

/**
 * Where the student currently stands, for the progress bar.
 *
 * `fill` is measured against the BOTTOM of the target range, not the maximum:
 * reaching the target should read as arriving, not as 84% of somewhere else. It is
 * clamped to 1 — past the target the COLOUR carries the message, not a longer bar.
 *
 * zone:
 *   'below'     — under the range (neutral; this is the normal state for most of a session)
 *   'in'        — inside the recommended range (positive)
 *   'over'      — past the range but still under the stated maximum (gentle amber)
 *   'over-max'  — past the stated maximum (needs cutting — Rule 14a)
 *
 * NOTE: never render `fill` as a percentage to the student. Words and the range only.
 */
export function targetProgress(words, range, maxWords = null) {
  const n = positiveNumber(words) ?? 0
  const max = positiveNumber(maxWords)
  if (!range || !Number.isFinite(range.low)) {
    return { fill: max ? Math.min(1, n / max) : 0, zone: max && n > max ? 'over-max' : 'below' }
  }
  const fill = Math.min(1, range.low > 0 ? n / range.low : 0)
  if (max != null && n > max) return { fill: 1, zone: 'over-max' }
  if (n > range.high) return { fill: 1, zone: 'over' }
  if (n >= range.low) return { fill: 1, zone: 'in' }
  return { fill, zone: 'below' }
}

/**
 * The one-line student-facing label: "Target: 420–480 · Max: 500".
 * An exact-count target collapses to a single number rather than "500–500".
 */
export function targetLabel(range, maxWords = null) {
  if (!range) return null
  const goal = range.low === range.high ? `${range.low}` : `${range.low}–${range.high}`
  const max = positiveNumber(maxWords)
  // Don't repeat the ceiling when the target IS the ceiling (short answers at 100%).
  return max != null && max !== range.high ? `Target: ${goal} · Max: ${max}` : `Target: ${goal}`
}
