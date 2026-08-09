// lib/sessionContinuation.js — "Keep working on this": build a v2 session from v1.
//
// PURE (no React/Next/Supabase) so the exact copy logic the /api/sessions/[id]/continue
// route runs is unit-testable — same pattern as lib/scaffoldWrite.js / lib/requirements.js.
// These builders produce INSERT payloads only; the route does the DB writes and the
// read-back verification. See docs/specs/brainscribe-keep-working-spec.md.
//
// The design rule that keeps this safe: we COPY finished rows wholesale, we never
// round-trip the student's finished words back through the coach's [DONE:]/[NUGGET:]
// token path (that path dropped student work three+ times — see lib/scaffoldWrite.js).

import { computeActualFromDraft } from './requirements.js'

// ── KILL SWITCH — back ON 2026-08-09, scoped to the EDIT path ────────────────
// Off 2026-08-08 for a real reason: a v2 carries v1's `current_paragraph_index`
// verbatim, and a finished v1 parks it at the all-done sentinel `components.length`.
// Successive dictated additions therefore recomputed the SAME position, and
// /api/paragraphs upserts on (session_id, position) — so the second addition silently
// replaced the first. The seventh silent drop path, landing on exactly the student who
// reopened a draft to add more.
//
// What changed: the DICTATION path is not fixed, it is REFUSED — loudly, in three
// places (resolveParagraphWriteIndex returns null, saveParagraph shows a notice instead
// of writing, and /api/paragraphs POST 409s on an occupied position in a continuation).
// It stays refused until there is a real target signal. What is now PROVEN safe is the
// EDIT path, which is how revision was always meant to work:
//
//   /api/paragraphs PATCH updates by EXPLICIT (session_id, position) and never consults
//   the cursor, so the sentinel collision cannot reach it. Verified end-to-end against
//   the live table by scripts/continuation-gate.mjs — carry three paragraphs, edit the
//   second, read all three back: only the edited row changed, the other two are
//   byte-intact, no row was created, and a PATCH matching zero rows raises PGRST116
//   rather than reporting success. Asserted on the VALUES, not the status code.
//
// So a v2 can now be minted: carried work is editable (the Edit button on each
// paragraph), new material can still be dictated into a section v1 left EMPTY (in-range
// and unoccupied — the guard allows exactly that), and everything else refuses out loud.
// The coach is told these mechanics in the CONTINUING A FINISHED DRAFT block so it routes
// revision to Edit instead of promising a dictation the app will reject
// (scripts/prompt-harness/continuation.mjs probe 4).
//
// Flip to false again if any of those three refusals regress.
export const CONTINUATION_ENABLED = true

// WHITELIST of v1 sessions columns that carry into v2 — everything ABOUT THE ASSIGNMENT,
// and nothing about v1's lifecycle/identity. A whitelist (not a blacklist) is the
// fail-safe choice for a student-work copy: a future sessions column defaults to NOT
// copied, so a new lifecycle/flag column can never silently leak into v2. `requirements`
// is handled separately (targets carried, actual recomputed). Deliberately EXCLUDED:
// completed_at, writing_profile, gym_session_id (would misroute to /skill-studio),
// is_onboarding + onboarding_prompt_key (would become an FTUE run), status, id/timestamps.
const COPY_SESSION_FIELDS = [
  'student_id', 'assignment_text', 'persona', 'title', 'outline', 'assignment_summary',
  'thesis_statement', 'thesis_confirmed', 'subject', 'subject_custom_label',
]

// buildContinuationSession(v1Session, v1Paragraphs, v1Components) -> the sessions INSERT
// payload for v2 (no id — the DB mints it). Carries the assignment + targets forward;
// recomputes requirements.actual from the CARRIED draft (never copies a stale actual).
export function buildContinuationSession(v1Session = {}, v1Paragraphs = [], v1Components = []) {
  const carried = {}
  for (const k of COPY_SESSION_FIELDS) {
    if (v1Session[k] !== undefined) carried[k] = v1Session[k]
  }

  // Inherit targets; recompute actual from the carried paragraphs/scaffold so the
  // finish-line chips show real progress toward the same goal (decision d).
  if (v1Session.requirements && Array.isArray(v1Session.requirements.targets)) {
    carried.requirements = {
      ...v1Session.requirements,
      actual: computeActualFromDraft(v1Paragraphs, v1Components),
    }
  }

  return {
    ...carried,
    status: 'active',
    is_onboarding: false,
    continued_from: v1Session.id ?? null,
    version: (Number.isFinite(v1Session.version) ? v1Session.version : 1) + 1,
  }
}

// Scaffold copy: the components tree (with confirmed text intact), thesis, counts.
// Returns null when v1 had no scaffold (a rare paragraphs-only session) so the caller
// simply skips the scaffold insert.
export function buildContinuationScaffold(v1Scaffold, newSessionId) {
  if (!v1Scaffold || !Array.isArray(v1Scaffold.components)) return null
  return {
    session_id: newSessionId,
    assignment_type: v1Scaffold.assignment_type ?? null,
    total_paragraphs: v1Scaffold.total_paragraphs ?? v1Scaffold.components.length,
    current_paragraph_index: v1Scaffold.current_paragraph_index ?? 0,
    components: v1Scaffold.components,
    thesis: v1Scaffold.thesis ?? null,
  }
}

const PARAGRAPH_FIELDS = ['scribed_text', 'raw_spoken_text', 'position', 'paragraph_index', 'paragraph_type', 'is_thin']

// The carried Final Draft / integrity baseline — verbatim, one row per v1 paragraph.
export function buildContinuationParagraphs(v1Paragraphs = [], newSessionId) {
  return (Array.isArray(v1Paragraphs) ? v1Paragraphs : []).map(p => {
    const row = { session_id: newSessionId }
    for (const f of PARAGRAPH_FIELDS) if (p[f] !== undefined) row[f] = p[f]
    return row
  })
}

const SOURCE_FIELDS = ['title', 'author', 'publisher', 'published_date', 'url', 'accessed_date', 'origin', 'position']

// Citation metadata carries so the bibliography survives into v2 (Research & Citations).
export function buildContinuationSources(v1Sources = [], newSessionId) {
  return (Array.isArray(v1Sources) ? v1Sources : []).map(s => {
    const row = { session_id: newSessionId }
    for (const f of SOURCE_FIELDS) if (s[f] !== undefined) row[f] = s[f]
    return row
  })
}
