// lib/startingDraft.js — the student's declared starting draft: what they arrived with.
//
// MERGED FROM TWO LANES (conductor, 2026-08-17 SF). focus/assignment-intake wrote the
// CAPTURE half (validation, limits, word counting, "is it too late to declare one") and
// focus/coaching-session wrote the READ half (how the snapshot enters provenance scoring,
// and how growth is stated). They were authored independently against a main that did not
// yet contain the other, so both created this file.
//
// 🔴 BOTH defined `fetchStartingDraft`, and the two were NOT equivalent. Intake's returned
// `null` on any error — indistinguishable from "this student has no starting draft" — which
// silently reinstates the exact ambiguity the read half exists to remove: a filtered or
// failed read would have scored provenance as though no draft existed. Coaching-session's
// classifies the read (present / absent / unknown) and is kept; intake's was dropped. If
// either lane disagrees, say so before this deploys.
//
// See SPEC-starting-draft.md and migration 071. The one property everything depends on is
// that the starting draft is an IMMUTABLE snapshot — if it can be edited in place there is
// no "before", and the growth artifact is fiction. Immutability is enforced by the table's
// grants; this module is validation plus the read side.

// Relative, not the `@/` alias: scripts/verify/*.mjs runs this module under bare node to
// prove the seam, and node cannot resolve the alias. Next resolves both.
import { contentTokens } from './provenance.js'

// The `source` CHECK constraint's values, mirrored from migration 071.
export const STARTING_DRAFT_SOURCES = ['typed', 'pasted', 'upload']

// ~8,000 words. Generous — a student arriving with a long story is the motivating case
// (2026-08-16: ~700 words pasted three times) — but bounded, because `content` is
// unbounded student input hitting a text column and an eventual prompt.
export const MAX_STARTING_DRAFT_CHARS = 50_000

// The same splitter used across the repo (lib/draftIntegrity.js countWords).
export function countDraftWords(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).length
}

// Validate a capture request. Returns { ok:true, content, wordCount, source } or
// { ok:false, error } with a message safe to show a student.
export function validateStartingDraft({ content, source = 'pasted' } = {}) {
  if (typeof content !== 'string') return { ok: false, error: 'No draft text provided.' }

  // Trim ONLY the edges. Interior whitespace is the student's paragraphing and this is
  // the immutable record of what they arrived with — normalising it would mean the
  // "before" we show a parent is not the thing they pasted.
  const trimmed = content.trim()
  if (!trimmed) return { ok: false, error: 'No draft text provided.' }
  if (trimmed.length > MAX_STARTING_DRAFT_CHARS) {
    return { ok: false, error: `That draft is too long to save here — max ${MAX_STARTING_DRAFT_CHARS.toLocaleString()} characters.` }
  }
  if (!STARTING_DRAFT_SOURCES.includes(source)) {
    return { ok: false, error: 'Unrecognised draft source.' }
  }
  return { ok: true, content: trimmed, wordCount: countDraftWords(trimmed), source }
}

// v1 refuses a starting draft on a session that already has confirmed work.
//
// Once locks exist it is not a baseline, it is a mid-stream paste — a different thing
// that needs its own product decision (SPEC-starting-draft.md). Accepting it here would
// backdate work the coach already drew out and make the growth artifact a lie in the
// flattering direction.
//
// `components` is paragraph_scaffolds.components: an array of paragraph objects with
// status 'complete' and items[] with status 'confirmed' (see lib/scaffoldProvenance.js).
// `paragraphCount` is rows in `paragraphs` — assembled work, unambiguously confirmed.
export function hasConfirmedWork(components = [], paragraphCount = 0) {
  if (Number(paragraphCount) > 0) return true
  return (components ?? []).some(p =>
    p?.status === 'complete' ||
    (p?.items ?? []).some(it => it?.status === 'confirmed')
  )
}

// 🔴 SEAM — focus/coaching-session calls this in app/api/scaffold/[sessionId]/route.js.
//
// A starting draft is a category of the student's OWN writing that is not in that route's
// `studentSources` list. If rows exist here and that list does not include them, every lock
// drawn from the draft scores novelFraction 1.00 and lands in provenance_checks as
// passed=false — the student's own writing recorded as coach-authored (Lever B BLOCKER 1),
// seeding fabricated failures into the dataset Phase 2 gets calibrated from.
//
// Their two-line change:
//   const startingDraft = await fetchStartingDraft(supabase, sessionId)
//   const studentSources = [
//     ...(startingDraft ? [startingDraft.content] : []),
//     ...(paras ?? []).map(p => p.raw_spoken_text),
//     ...(msgs ?? []).map(m => m.content),
//   ]
//
// Returns null when there is no draft, and ALSO null on a read error — callers use this to
// widen a provenance source list, where a missing row and an unreadable one are the same
// (score against what we can prove). It must never be used to decide whether a capture may
// proceed: that check reads the row directly so an error cannot be mistaken for "absent".

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

// ── A detector was here, and it is DELETED rather than tuned (2026-08-17) ────────────
// `draftOverlapFraction(startingContent, draftText)` measured how many of the working
// draft's content-words also appear in the starting draft, and StartingDraftCard showed it
// to watchers above 20%: "N% of the new writing also appears in the starting draft, so some
// of it is text brought forward rather than newly written."
//
// It is a stemmed, stopword-stripped BAG-OF-WORDS fraction. It measures shared VOCABULARY,
// not re-pasting. Measured on genuinely new prose continuing the same story, pasted from
// nowhere: **46%** — so the notice fired hardest in the feature's intended use case, and
// told a parent their child had carried text forward when they had not. An uncalibrated
// accusation, watcher-facing, asserting a cause the measurement cannot support.
//
// This card's principle is TRANSPARENCY, NOT DETECTION (SPEC-starting-draft.md, "the cheat
// vector, named"): a watcher who can see "arrived with 800 words, added 40" needs no
// detector. The function is deleted, not merely unwired — left exported and unused it is an
// invitation to wire the same mistake back in. If a future change needs a re-paste signal
// it needs a real one, calibrated, and this note is the record of what a cheap one costs.


/**
 * Read a session's starting draft. Returns `{ draft, state }` — never throws.
 *
 * The client is INJECTED so this stays testable and so callers pick the right one.
 *
 * ⚠️ Guarded because focus/assignment-intake owns migration 071. An unguarded read against
 * a missing table would 500 the transcript and the live session for every student — the
 * seam breaking in the loudest possible way, on the pages that show a child their own
 * writing.
 *
 * 🔴 IT RETURNS THE STATE, NOT JUST THE ROW. An earlier version returned `null` for both
 * `absent` and `unknown`, which is the SAME ambiguity collapse the conductor dropped the
 * other lane's `fetchStartingDraft` for — mine only differed by logging. And on this side
 * the failure flatters the student: a read that fails silently omits the "arrived with 800
 * words" half, so a parent sees only the working draft and reads all of it as new. The
 * growth artifact's whole job is to say what was there BEFORE; rendering nothing is not a
 * neutral degradation, it is the wrong answer in the reassuring direction.
 */
export async function fetchStartingDraft(db, sessionId) {
  if (!db || !sessionId) return { draft: null, state: 'absent' }
  const { data, error } = await db
    .from(STARTING_DRAFT_TABLE)
    .select(STARTING_DRAFT_COLUMNS)
    .eq('session_id', sessionId)
    .maybeSingle()
  const state = classifyStartingDraftRead(error, data)
  if (state === 'unknown') {
    console.error(
      `[starting-draft] read FAILED for session ${sessionId}: ${error?.code ?? '?'} ${error?.message ?? ''} — ` +
      `the card will say it could not be loaded rather than implying there was nothing`
    )
  }
  return { draft: state === 'present' ? data : null, state }
}
