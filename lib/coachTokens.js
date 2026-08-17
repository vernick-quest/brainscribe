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
