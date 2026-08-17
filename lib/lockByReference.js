// lib/lockByReference.js — resolve a lock that REFERENCES the student's words instead of
// echoing them. See SPEC-lock-by-reference.md.
//
// PURE (no React/Next/Supabase) so the exact rules the client runs are unit-tested — the
// same pattern as lib/scaffoldWrite.js, whose header lists the six paths that destroyed
// student writing. This file is the resolution half ONLY; the token contract and the
// prompt that emits these forms belong to focus/coach-ai and must land with it.
//
// ── Why this exists ─────────────────────────────────────────────────────────────────
// `[DONE:id:exact words]` carries the student's text, so max_tokens on a coach turn is not
// a limit on how much the COACH may say — it is a limit on how long a section of the
// STUDENT'S WRITING may be. A 685-word scene produced a ~950-token lock payload against a
// 1000-token ceiling; the reply cut mid-word, the closing bracket never arrived, and the
// parser produced ZERO locks. Not a partial save — nothing, twice. Six ceilings were raised
// that day and every one is a workaround, because a long enough passage beats any number.
//
// The stronger reason is tamper-resistance: while the coach retypes, it can change the
// words. A reference cannot be altered in transit, which turns the product's central
// promise from a rule the model follows into a property of the system.
//
// ── The one rule that governs everything here ───────────────────────────────────────
// REFUSE RATHER THAN GUESS. A wrong span is worse than a failed lock, because it looks
// finished. Every failure returns a reason; nothing here ever falls back to "close enough".

// Canonical anchored form (for coach-ai's prompt):
//     [DONE:body:"first few words"…"last few words"]
// Accepted leniently at the PARSE layer — a real model emits curly quotes and sometimes
// three dots — and then matched strictly at the RESOLUTION layer. Leniency about how the
// form is written is not leniency about which span it picks.
const ANCHOR_RE = /^\s*["“”'‘’](.+?)["“”'‘’]\s*(?:…|\.\.\.)\s*["“”'‘’](.+?)["“”'‘’]\s*$/s

/**
 * Classify the payload that follows `id:` in a [DONE:…] / [NUGGET:…] token.
 *
 * @returns {{kind:'bare'}}                       — lock what the client already holds (dictation)
 *        | {{kind:'anchored', start, end}}       — resolve a span of the student's own message
 *        | {{kind:'inline', text}}               — the legacy echo; still supported forever
 *
 * Old sessions keep old payloads, so `inline` must never stop being read (spec, Rollout 5).
 */
export function parseLockPayload(rest) {
  const s = String(rest ?? '')
  if (!s.trim()) return { kind: 'bare' }
  const m = ANCHOR_RE.exec(s)
  if (m) {
    const start = m[1].trim()
    const end = m[2].trim()
    // An empty anchor would match at position 0 of everything. Treat the whole payload as
    // a legacy echo rather than resolving something meaningless.
    if (start && end) return { kind: 'anchored', start, end }
  }
  return { kind: 'inline', text: s.trim() }
}

// Collapse whitespace runs to a single space, keeping a map back to the ORIGINAL offsets.
// A model quoting a passage reliably reproduces the words and unreliably reproduces the
// newline the student typed mid-sentence. Matching on a normalized view fixes that without
// loosening what gets picked: normalization can only ever turn one match into several,
// which this module refuses on. The span is then cut from the ORIGINAL string, so what is
// stored is byte-identical to what the student wrote.
function normalizeWithMap(text) {
  const src = String(text ?? '')
  let norm = ''
  const map = []
  let inWs = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      if (!inWs) { norm += ' '; map.push(i); inWs = true }
      continue
    }
    inWs = false
    norm += ch
    map.push(i)
  }
  return { norm, map }
}

const normalizeAnchor = a => String(a ?? '').replace(/\s+/g, ' ').trim()

// Every offset in `hay` where `needle` occurs (non-overlapping is not required — we only
// care how MANY, and more than one is a refusal).
function allIndexesOf(hay, needle) {
  const out = []
  if (!needle) return out
  let from = 0
  for (;;) {
    const i = hay.indexOf(needle, from)
    if (i === -1) return out
    out.push(i)
    from = i + 1
    if (out.length > 2) return out   // two is already ambiguous; stop counting
  }
}

/**
 * Resolve an anchored span against the student's OWN messages.
 *
 * @param anchors      {start, end} from parseLockPayload
 * @param userMessages array of the student's message strings, in order (role:'user' only —
 *                     the caller must never pass coach turns, or the coach could anchor
 *                     into its own words and reintroduce exactly the tampering this
 *                     mechanism exists to prevent)
 * @returns {{ok:true, text, messageIndex, start, end}}
 *        | {{ok:false, reason, detail}}
 *
 * Enforces, in order, the spec's five rules:
 *  1. start matches exactly one position (2+ → refuse)
 *  2. end matches exactly one position, AFTER the start
 *  3. both anchors in the SAME message (v1)
 *  4. the resolved text is a contiguous substring of that message — asserted, not assumed
 *  5. any failure refuses with a reason; never an approximate span
 */
export function resolveAnchoredSpan(anchors, userMessages = []) {
  const start = normalizeAnchor(anchors?.start)
  const end = normalizeAnchor(anchors?.end)
  if (!start || !end) return { ok: false, reason: 'empty-anchor', detail: 'start and end are both required' }

  const messages = (Array.isArray(userMessages) ? userMessages : []).map(m => String(m ?? ''))

  // Rule 1 + 3: find the start across ALL messages. Ambiguity anywhere is a refusal —
  // a phrase the student used twice cannot be resolved, and picking the first is the
  // "wrong span that looks finished" this design exists to prevent.
  const startHits = []
  const endHits = []
  const views = messages.map(normalizeWithMap)
  for (let mi = 0; mi < views.length; mi++) {
    for (const off of allIndexesOf(views[mi].norm, start)) startHits.push({ mi, off })
    for (const off of allIndexesOf(views[mi].norm, end)) endHits.push({ mi, off })
    if (startHits.length > 1 && endHits.length > 1) break
  }

  if (startHits.length === 0) return { ok: false, reason: 'start-not-found', detail: start }
  if (startHits.length > 1) {
    return { ok: false, reason: 'start-ambiguous', detail: `"${start}" appears ${startHits.length}+ times` }
  }
  if (endHits.length === 0) return { ok: false, reason: 'end-not-found', detail: end }
  if (endHits.length > 1) {
    return { ok: false, reason: 'end-ambiguous', detail: `"${end}" appears ${endHits.length}+ times` }
  }

  const s = startHits[0]
  const e = endHits[0]

  // Rule 3 — v1 refuses a span across messages rather than stitching turns together.
  if (s.mi !== e.mi) {
    return { ok: false, reason: 'different-messages', detail: `start in message ${s.mi}, end in message ${e.mi}` }
  }

  // Rule 2 — the end must come after the start. Anchors out of order mean the coach has
  // the passage backwards; resolving them anyway would lock a span the student never wrote
  // as a unit.
  const endNormEnd = e.off + end.length
  if (endNormEnd <= s.off) {
    return { ok: false, reason: 'end-before-start', detail: `end at ${e.off} is not after start at ${s.off}` }
  }

  // Cut from the ORIGINAL text using the offset map, so the stored words are byte-identical
  // to what the student wrote (not the normalized view we matched on).
  const { norm, map } = views[s.mi]
  const origStart = map[s.off]
  const origEnd = map[Math.min(endNormEnd - 1, norm.length - 1)] + 1
  const message = messages[s.mi]
  const text = message.slice(origStart, origEnd)

  // Rule 4 — assert, do not trust. Every silent loss in this codebase returned unchanged
  // state with no throw and no log; a resolution that "should" be a substring gets checked.
  if (!text || !message.includes(text)) {
    return { ok: false, reason: 'not-contiguous', detail: 'resolved span is not a substring of the message' }
  }

  return { ok: true, text, messageIndex: s.mi, start: origStart, end: origEnd }
}

/**
 * One-shot convenience: payload → resolved text, or a refusal.
 *
 * `bare` and `inline` are returned for the caller to handle (mechanism 1 locks the pending
 * client-held text; inline is the legacy echo). Only `anchored` resolves here.
 */
export function resolveLockPayload(rest, userMessages = []) {
  const parsed = parseLockPayload(rest)
  if (parsed.kind !== 'anchored') return parsed
  const res = resolveAnchoredSpan(parsed, userMessages)
  return res.ok
    ? { kind: 'anchored', ok: true, text: res.text, messageIndex: res.messageIndex }
    : { kind: 'anchored', ok: false, reason: res.reason, detail: res.detail }
}
