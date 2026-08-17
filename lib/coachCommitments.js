// lib/coachCommitments.js — what the coach PROMISED it saved.
//
// PURE brain (no Next/Supabase) so the parser is unit-testable — same split as
// lib/scaffoldWrite.js and lib/draftIntegrity.js.
//
// ── Why this exists ───────────────────────────────────────────────────────────────────
// Every previous attempt to detect lost student writing was an INFERENCE from the saved
// artifact: empty slots, short word counts, cursor position. All of them were ambiguous,
// because a component the coach deliberately skipped looks exactly like a component whose
// write was dropped. Word count was the worst of them — a target is a ceiling ("up to 500
// words"), so writing less is a student's choice, not a fault.
//
// The unambiguous signal was in the stream all along. When the coach emits [DONE:body] it
// is making a PROMISE: "the student's body paragraph is now saved." Two things follow:
//
//   · A promise with nothing behind it is loss, provable, with no inference at all.
//   · No promise means nothing was ever meant to be there — Lyndsay's coach never emitted
//     [DONE:roadmap] because it told her a quick write doesn't need one. Correctly silent.
//
// ── The property that makes it trustworthy ────────────────────────────────────────────
// This record is written SERVER-side in /api/tutor's after() hook, from the raw stream
// text. The student's writing is saved CLIENT-side through the scaffold. Two independent
// paths, reconciled later. That matters: if the promise were recorded by the same code
// that saves the work, a dropped write would drop the evidence with it and we'd learn
// nothing — which is exactly how both silent-drop bugs stayed invisible for a month.
//
// It also catches drop paths we haven't found yet, because it doesn't encode any theory
// about HOW the write fails — only that one was owed.

import { stripCoachTokens } from './coachTokens.js'

// [DONE:hook] · [DONE:hook:the exact words they approved] · [PARA_DONE:0:summary]
const DONE_RE = /\[DONE:([a-z0-9_]+)(?::([^\]]*))?\]/gi
const PARA_DONE_RE = /\[PARA_DONE:(\d+)(?::[^\]]*)?\]/gi

/**
 * Pull every component the coach claimed to have locked in, from one turn's raw text.
 *
 * @param text  the UNSTRIPPED assistant turn (tokens still present)
 * @returns {{ components: string[], paragraphsCompleted: number[] }} deduped, in order
 */
export function parseCommitments(text) {
  const src = String(text || '')
  const components = []
  const paragraphsCompleted = []
  // The words a [DONE:id:exact text] carried. When the client's read loop dies mid-stream
  // it discards the whole turn, while the server has already persisted the token-STRIPPED
  // message — so text that only ever existed inline is gone for good. Keeping it here
  // means a broken commitment can be RESTORED, not merely reported.
  const inlineText = {}

  DONE_RE.lastIndex = 0
  for (const m of src.matchAll(DONE_RE)) {
    const id = m[1].toLowerCase()
    if (!components.includes(id)) components.push(id)
    const inline = (m[2] ?? '').trim()
    if (inline) inlineText[id] = inline
  }
  PARA_DONE_RE.lastIndex = 0
  for (const m of src.matchAll(PARA_DONE_RE)) {
    const idx = Number(m[1])
    if (Number.isInteger(idx) && !paragraphsCompleted.includes(idx)) paragraphsCompleted.push(idx)
  }
  return { components, paragraphsCompleted, inlineText }
}

/**
 * Reconcile promises against what actually got saved.
 *
 * A commitment is BROKEN when the coach said a component was locked in and that component
 * holds no text anywhere the student can see it — neither in the scaffold nor in the
 * rendered Final Draft. Matching on the component id alone would miss the case where the
 * text was scribed into a paragraph instead, which is normal and healthy.
 *
 * @param commitments  [{ component_id }] recorded server-side for this session
 * @param components   `paragraph_scaffolds.components`
 * @param opts.restored  true when this session was already repaired — a restore fills the
 *                       paragraph rows, so its old scaffold slots stay empty forever and
 *                       would otherwise report a permanent, unfixable broken promise.
 * @returns {{ broken: string[], kept: string[], checked: number }}
 */
export function reconcileCommitments(commitments = [], components = [], opts = {}) {
  if (opts.restored) return { broken: [], kept: [], checked: 0 }

  const filled = new Set()
  const known = new Set()
  for (const sec of components ?? []) {
    for (const it of sec.items ?? []) {
      const id = String(it.id).toLowerCase()
      known.add(id)
      if (it.text || it.nuggetText) filled.add(id)
    }
  }

  const seen = new Set()
  const broken = []
  const kept = []
  for (const c of commitments ?? []) {
    const id = String(c?.component_id ?? c ?? '').toLowerCase()
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (filled.has(id)) { kept.push(id); continue }
    // The id doesn't exist in this scaffold AT ALL. That is the custom-scaffold case: the
    // coach names the standard prose components (hook/context/closing) while the scaffold
    // holds c0/c1, so the write is REDIRECTED to a real component (resolveComponentWrite).
    // The promise was kept — under a different name. Reporting it broken forever produced a
    // permanent, unfixable alert on Baron's Gratitude Letter even after it was restored,
    // which is exactly the noise that makes an alert screen get skimmed.
    if (!known.has(id) && filled.size > 0) { kept.push(id); continue }
    broken.push(id)
  }
  return { broken, kept, checked: seen.size }
}

// ── The PROSE promise, checked against the TOKEN promise ─────────────────────────────
//
// Everything above compares what the coach PROMISED IN TOKENS against what got saved.
// This compares what the coach promised IN WORDS against what it promised in tokens —
// one turn, no database, no reconciliation later.
//
// The failure it catches, observed 3/3 against the shipped prompt before Rule 25 (see
// scripts/prompt-harness/oversized-lock.mjs): a student hands over a passage too big for
// one slot, the coach agrees to put it in as two scenes, then emits ONE [DONE:] and
// writes "Both scenes are locked in." The second scene is never saved and the student has
// been told it is safe. Nothing downstream can see it — no promise was recorded for the
// missing scene, so the commitment reconciler has nothing to reconcile. Silence, in the
// reassuring direction, which is this codebase's whole history of data loss.
//
// Rule 25 currently holds this at 0/4. That is a BEHAVIOURAL RATE, not a guarantee, and it
// has to be re-measured every time the prompt moves. This is the deterministic half.

// "both", "all three" → how many the sentence claims went in.
const CLAIM_COUNTS = { both: 2, two: 2, three: 3, four: 4, five: 5 }

// A completed, plural lock claim. Kept deliberately narrow — see the exclusions below.
const PLURAL_CLAIM_RE =
  /\b(?:(both)|all (?:of )?(?:the )?(two|three|four|five))\b[^.!?\n]{0,40}?\b(?:locked|saved|(?:are|is) in\b|in your draft)/i
// "locked them both in" / "locked both of those in" — verb first, quantifier after.
const CLAIM_VERB_FIRST_RE = /\block(?:ed|ing)?\s+(?:them\s+|those\s+|these\s+)?both\b/i

// NOT a claim that something is already saved:
//   • a question — "want me to lock both in?"
//   • an offer or intention — "say the word and I'll lock them both in"
// Both are correct coaching (Rule 25 explicitly tells the coach to say the second one), so
// counting them would flag the exact behaviour we asked for.
const NOT_YET_RE =
  /\b(?:i'?ll|i will|we'?ll|we can|want me to|shall i|should i|if you|once you|when you|say the word|ready to|going to|do you want)\b/i

/**
 * Did this turn claim more sections were locked than it actually locked?
 *
 * @param rawText  the UNSTRIPPED assistant turn (tokens still present)
 * @returns {{ overClaimed: boolean, emitted: number, claimedAtLeast: number, sentence: string|null }}
 */
export function detectLockOverClaim(rawText) {
  const raw = String(rawText || '')
  const { components } = parseCommitments(raw)
  const emitted = components.length
  const none = { overClaimed: false, emitted, claimedAtLeast: 0, sentence: null }

  // REQUIRES at least one lock this turn, on purpose. With zero locks a plural sentence is
  // almost always a legitimate progress recap read off the scaffold — "you've got two
  // paragraphs locked in" (Rule 20 asks for exactly that) — and flagging those would bury
  // the real signal in noise. A prose-only lock claim with NO token is a different breach
  // (Lock-Language ⇔ Token Binding) and needs its own detector, not this one.
  if (emitted === 0) return none

  // Scan the STUDENT-VISIBLE prose only: a [DONE:…] payload carries the student's own
  // words, and their story is allowed to contain the word "both".
  const prose = stripCoachTokens(raw)

  for (const sentence of prose.split(/(?<=[.!?])\s+|\n+/)) {
    const s = sentence.trim()
    if (!s || s.endsWith('?') || NOT_YET_RE.test(s)) continue

    const m = PLURAL_CLAIM_RE.exec(s)
    const claimedAtLeast = m
      ? CLAIM_COUNTS[(m[1] ?? m[2]).toLowerCase()] ?? 2
      : CLAIM_VERB_FIRST_RE.test(s) ? 2 : 0

    if (claimedAtLeast > emitted) return { overClaimed: true, emitted, claimedAtLeast, sentence: s }
  }
  return none
}
