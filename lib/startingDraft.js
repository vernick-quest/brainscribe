// The starting draft — what a student arrived with, captured once at session creation
// and then frozen. See SPEC-starting-draft.md and migration 071.
//
// Everything here is PURE except fetchStartingDraft. The validation lives apart from the
// route so the rules are unit-testable without a database, and so the client and server
// cannot disagree about what counts as a word (the count is STORED at capture; a drift
// between two splitters would silently change the growth number a parent is shown).

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
export async function fetchStartingDraft(supabase, sessionId) {
  const { data, error } = await supabase
    .from('session_starting_drafts')
    .select('content, word_count, created_at, source')
    .eq('session_id', sessionId)
    .maybeSingle()
  if (error) {
    console.error('[startingDraft] read failed:', error.message)
    return null
  }
  return data ?? null
}
