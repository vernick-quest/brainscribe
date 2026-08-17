// lib/coachTokens.js — "did a lock token actually LAND?", asked the way the client asks it.
//
// ── The bug this exists to prevent (shipped 2026-08-16, caught same day) ─────────────
// The truncation counter in /api/tutor and the parser in components/TutorSession.js each
// carried their own hand-written regex for the same tokens. They disagreed on one
// character:
//
//   counter  /\[(DONE|THESIS|PARA_DONE|COMPLETE|CARE)[:\]]/   <- matches the OPENING bracket
//   client   /\[(…|DONE|THESIS|PARA_DONE):([^\]]*)\]/g        <- requires the CLOSING one
//
// A turn cut off at max_tokens ends mid-payload — `[DONE:hook:Sierra had been walking` —
// so the counter said "a lock token was emitted" while the client parsed ZERO locks. That
// made `truncated_turns_no_lock` read 0 on precisely the sessions where a lock was
// dropped: the metric was blind in the exact case it was built to detect, and blind in
// the REASSURING direction. Sierra's session reported no_lock=0 and had lost a lock.
//
// So the question is never "does the text contain a token-ish string". It is "would the
// CLIENT parse a lock out of this", and only a CLOSED token clears that bar:
//   • [DONE:…] [THESIS:…] [PARA_DONE:…]  — colon form, closing ] required (client tokenRE)
//   • [COMPLETE] [CARE]                  — bare form, matched by exact-literal includes()
// A token that opens and never closes is a DROPPED lock, which is the whole signal.
//
// SCAFFOLD/ACTIVE/NUGGET/SOURCE are deliberately NOT here. They are not locks — they set
// structure, focus, capture. Dropping one does not lose confirmed student words, and
// counting them as "a lock landed" would re-open this same blindness by a different door.
//
// lib/coachTokens.test.js holds both halves of the guarantee: truncated shapes must NOT
// count, and a parity sweep reads the live regex out of components/TutorSession.js so
// the two can never silently drift apart again.

// A lock token that OPENED AND CLOSED — i.e. one the client will actually parse.
export const LANDED_LOCK_TOKEN_RE = /\[(?:DONE|THESIS|PARA_DONE):[^\]]*\]|\[(?:COMPLETE|CARE)\]/

// ── Stripping control tokens out of what gets SAVED and SHOWN ───────────────────────
// Every control token is machine signalling. None of it may reach the student on screen,
// and none of it belongs in the `messages` row a parent, a teacher or the audit judge
// later reads. Keep this in step with ALL_TOKEN_RE in components/TutorSession.js.
//
// This was a FOURTH hand-written copy before it moved here (2026-08-16). The gym coach at
// app/api/gym/tutor/route.js carried its own, and that copy was missing [CARE] and
// [SOURCE] — both of which the SHARED prompt builder can emit, because Skill Studio runs
// on the same guardrails. The client strips them (Skill Studio renders through the same
// TutorSession), so nothing leaked on screen; what leaked was the SAVED transcript, which
// kept a literal [CARE] in its text. A child-safety signal is precisely the thing that
// must not survive as a stray token in a record someone else reads.
//
// Global flag, so callers must not share a single instance across .test() calls — every
// consumer here uses .replace(), which resets lastIndex.
export const COACH_TOKEN_RE =
  /\[(?:SCAFFOLD|ACTIVE|NUGGET|DONE|THESIS|PARA_DONE|SOURCE):[^\]]*\]|\[COMPLETE\]|\[DICTATE\]|\[CARE\]/g

/** What the student sees, and what we persist: the turn with all control tokens removed. */
export function stripCoachTokens(text) {
  return typeof text === 'string' ? text.replace(COACH_TOKEN_RE, '').trim() : ''
}

/**
 * Did this coach turn land a lock the client can parse?
 *
 * Used as the discriminator on a truncated turn: truncated WITHOUT a landed lock is the
 * case that may have destroyed a student's confirmed words. Answer honestly on junk —
 * a non-string is "no lock", never a throw, because this runs in a `finally` block whose
 * failure would take the usage/truncation write down with it.
 */
export function hasLandedLockToken(text) {
  return typeof text === 'string' && LANDED_LOCK_TOKEN_RE.test(text)
}
