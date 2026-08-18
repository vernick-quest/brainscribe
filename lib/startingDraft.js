// lib/startingDraft.js — the student's declared starting draft: what they arrived with.
//
// See SPEC-starting-draft.md. The one property everything depends on is that the starting
// draft is an IMMUTABLE snapshot — if it can be edited in place there is no "before", and
// the growth artifact is fiction. That immutability is enforced by the table's grants
// (focus/assignment-intake owns the migration); this module is the read side: how the
// snapshot enters provenance scoring, and how the growth number is stated.
//
// PURE. Nothing here touches Supabase or React, so the honesty rules below are unit-tested
// rather than argued about.

// Relative, not the `@/` alias: scripts/verify/*.mjs runs this module under bare node to
// prove the seam, and node cannot resolve the alias. Next resolves both.
import { contentTokens } from './provenance.js'

// The table the intake lane creates in its migration. Named once, here, so the two lanes
// cannot drift on it — this is the seam the spec calls out, and it is meaningless until
// intake writes rows.
export const STARTING_DRAFT_TABLE = 'session_starting_drafts'
// The columns, named ONCE. They were two independent literals across two files, and a
// mismatch with intake's actual schema returns 42703 — which this module classifies
// `unknown`, which suppresses provenance recording for EVERY session. A drift that costs
// the whole signal should not be possible by typo.
export const STARTING_DRAFT_COLUMNS = 'content, word_count, source, created_at'
// The provenance path needs only the text.
export const STARTING_DRAFT_CONTENT_COLUMN = 'content'

/**
 * ── THE SEAM (SPEC-starting-draft.md, "It must enter studentSources in the same change") ──
 *
 * `app/api/scaffold/[sessionId]/route.js` scores every lock against the student's own
 * words. That array is the paragraphs' `raw_spoken_text` plus their `role:'user'` turns. A
 * starting draft is a THIRD category of the student's own writing, and it is in neither.
 *
 * Ship the capture without this and every lock drawn from that draft scores
 * `novelFraction 1.00` and lands in `provenance_checks` as `passed=false` — the student's
 * own writing recorded as coach-authored. That is Lever B blocker 1, and it would seed
 * fabricated failures into the very dataset Phase 2 gets calibrated from.
 */
export function startingDraftSources(draft) {
  const content = draft?.content
  return typeof content === 'string' && content.trim() ? [content] : []
}

// PostgREST's ways of saying "that table isn't there". Expected while intake's migration is
// unapplied; NOT expected afterwards, and the difference decides whether scoring is safe.
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

/**
 * What a failed starting-draft read means for provenance scoring.
 *
 * `absent`   — no row for this session. Score normally; there is nothing to miss.
 * `no-table` — the migration has not been applied, so NO session can have a starting
 *              draft. Scoring without one is exactly correct, so proceed as before.
 * `unknown`  — the read errored for some other reason: a schema mismatch (42703), a missing
 *              grant (42501), a network fault. We cannot tell whether this session has a
 *              starting draft, so we cannot tell whether a lock drawn from it is mis-scored.
 *
 * 🔴 WHAT THIS CANNOT SEE, and an earlier version of this comment wrongly claimed it could:
 * **RLS does not error.** A row filtered by a policy comes back `200` with `data: null` —
 * verified against live PostgREST — which is INDISTINGUISHABLE from "this session has no
 * starting draft". So if intake's SELECT policy is wrong, this classifies `absent`, scoring
 * proceeds without the draft, and the exact blocker this seam exists to prevent reoccurs
 * with every check reporting green. That is CLAUDE.md's "assert on the VALUE, never the
 * status code" trap, and no client-side classification can close it.
 *
 * Two consequences, both deliberate:
 *   1. The provenance path reads with the SERVICE client, which no policy can filter — so
 *      the failure mode above cannot arise there, whatever policy intake ships.
 *   2. The spec's "assert the denial on a planted sentinel row" proof is therefore
 *      load-bearing for THIS lane's correctness, not just intake's, and gates the merge.
 *
 * ⚠️ `unknown` must NOT be treated as `absent`. That substitution is what turns a read
 * failure into a permanent false record: the lock still persists (student writing is never
 * blocked), but a check we cannot trust must not be written to `provenance_checks`. A HOLE
 * in the signal is recoverable; a fabricated failure calibrated into Phase 2 is not. The
 * route already applies this reasoning to unscorable locks — same rule, new cause.
 */
export function classifyStartingDraftRead(error, row) {
  if (error) return MISSING_TABLE_CODES.has(error.code) ? 'no-table' : 'unknown'
  return row ? 'present' : 'absent'
}

/** Whether a provenance check computed under this read state is safe to record. */
export function provenanceIsTrustworthy(readState) {
  return readState !== 'unknown'
}

/**
 * The growth artifact: "arrived with 800 words, added 40".
 *
 * ⚠️ Both numbers are READ or measured by an existing function — never re-derived here.
 * `startingWordCount` is the stored column (the spec stores it precisely so the growth
 * number never depends on re-tokenising), and `draftWords` comes from
 * `computeActualFromDraft`, the same function the progress chips and the transcript use. A
 * number this file computed on top of those would be a third opinion nobody could check.
 *
 * ⚠️ AND IT IS NOT A SUBTRACTION. In v1 the starting draft does not seed the scaffold
 * (spec: "does it seed the scaffold? recommend no"), so the working draft holds only what
 * was written with the coach — the two are disjoint by construction and `draftWords` IS
 * the growth. Subtracting would report a negative number the moment a student arrives with
 * more than they add, which is the common case and the whole point of the feature.
 *
 * The honest limit, named rather than papered over: if a student re-pastes their starting
 * draft into a lock, those words count in `draftWords` and the "added" number overstates.
 * `overlapFraction` measures that rather than guessing at it — see below.
 */
export function growthSummary({ startingWordCount, draftWords } = {}) {
  // Coerce: PostgREST returns a postgres `numeric`/`bigint` as a STRING, so a strict
  // Number.isFinite on the raw value reported 0 for a perfectly good 800-word draft — and
  // the card would have rendered "Arrived with 0 words" above 800 words of visible text.
  const toCount = v => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
  }
  const arrivedWith = toCount(startingWordCount)
  const addedWords = toCount(draftWords)
  return {
    arrivedWith,
    addedWords,
    hasStartingDraft: arrivedWith > 0,
    // Stated as growth, never as total output (spec, "the cheat vector, named").
    headline: `Arrived with ${arrivedWith.toLocaleString()} word${arrivedWith === 1 ? '' : 's'}, ` +
              `added ${addedWords.toLocaleString()}`,
  }
}

/**
 * How much of the working draft is re-entered starting-draft text, 0..1.
 *
 * Uses `contentTokens` — provenance's tokenizer, not a second one — so this cannot disagree
 * with the scoring the same words receive at lock time. Reported as a MEASUREMENT with no
 * threshold attached: this repo's thresholds have been wrong before, and a watcher reading
 * "40 words, 38 of which also appear in the starting draft" needs no threshold from us.
 *
 * Returns 0 when either side has no content words — nothing to overstate.
 */
export function draftOverlapFraction(startingContent, draftText) {
  const draftTokens = contentTokens(draftText)
  if (draftTokens.length === 0) return 0
  const startingSet = new Set(contentTokens(startingContent))
  if (startingSet.size === 0) return 0
  const shared = draftTokens.filter(t => startingSet.has(t)).length
  return shared / draftTokens.length
}

/**
 * Read a session's starting draft, degrading to `null` rather than throwing.
 *
 * The client is INJECTED so this stays testable and so callers pick the right one (the
 * transcript reads under the viewer's RLS; the assignment page reads as the owner).
 *
 * ⚠️ Guarded because focus/assignment-intake owns the migration and it may not be applied
 * when this ships. An unguarded read against a missing table would 500 the transcript and
 * the live session for every student — the seam breaking in the loudest possible way, on
 * the pages that show a child their own writing.
 */
export async function fetchStartingDraft(db, sessionId) {
  if (!db || !sessionId) return null
  const { data, error } = await db
    .from(STARTING_DRAFT_TABLE)
    .select(STARTING_DRAFT_COLUMNS)
    .eq('session_id', sessionId)
    .maybeSingle()
  const state = classifyStartingDraftRead(error, data)
  if (state === 'unknown') {
    console.error(
      `[starting-draft] read failed for session ${sessionId}: ${error?.code ?? '?'} ${error?.message ?? ''} — ` +
      `rendering without it, so the growth artifact is MISSING rather than wrong`
    )
  }
  return state === 'present' ? data : null
}
