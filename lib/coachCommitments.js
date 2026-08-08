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
