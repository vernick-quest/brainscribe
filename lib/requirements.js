// Assignment requirement metrics — shared by the client (live progress chip),
// the coach prompt builder, and the API routes that persist actual progress.
// Pure functions only (no imports) so this is safe to import from both client
// components and server routes.
//
// requirements shape on a session row:
//   { targets: [{type:'words',min,max,label} | {type:'paragraphs',target,label}],
//     actual:  { words, paragraphs } }

export function countWords(text) {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

// Actual progress from the student's written paragraphs.
export function computeActual(paragraphs) {
  const list = Array.isArray(paragraphs) ? paragraphs : []
  const withText = list.filter(p => p?.scribed_text && p.scribed_text.trim())
  const words = withText.reduce((sum, p) => sum + countWords(p.scribed_text), 0)
  return { words, paragraphs: withText.length }
}

// The WIP draft's locked text lines from a scaffold's components tree. Mirrors
// the transcript's `scaffoldLines`: each item contributes its final text
// (`.text`) or dictated nugget (`.nuggetText`); unreached/locked items have
// neither and drop out. Safe on any shape (missing/!array → []).
export function scaffoldDraftLines(components) {
  const list = Array.isArray(components) ? components : []
  return list
    .flatMap(sec => (Array.isArray(sec?.items) ? sec.items : []))
    .filter(it => it && (it.text || it.nuggetText))
    .map(it => it.text || it.nuggetText)
}

// Draft-aware progress, for watcher-facing WIP readouts. Prefers assembled
// paragraphs (the durable, prose-assembled source); when none exist yet — early
// WIP where the student has locked components but no paragraph is assembled — it
// falls back to the scaffold's locked items so the running word count reflects
// in-progress work instead of reading 0. This mirrors the transcript essay's own
// `paragraphs.length ? paragraphs : scaffoldLines` fallback, so the count always
// matches the draft shown. Paragraph count stays paragraphs-only (a scaffold-only
// WIP legitimately has 0 assembled paragraphs). Does NOT change computeActual's
// paragraphs-only semantics — callers that must stay paragraphs-only keep using it.
export function computeActualFromDraft(paragraphs, scaffoldComponents) {
  const fromParas = computeActual(paragraphs)
  if (fromParas.words > 0 || fromParas.paragraphs > 0) return fromParas
  const lines = scaffoldDraftLines(scaffoldComponents)
  if (lines.length === 0) return fromParas // { words: 0, paragraphs: 0 }
  const words = lines.reduce((sum, line) => sum + countWords(line), 0)
  return { words, paragraphs: fromParas.paragraphs }
}

// Display state for one target chip: { full, short, met }.
// `full` is shown on sm+; `short` is the compact mobile form.
export function chipState(target, actual = {}) {
  if (!target || typeof target !== 'object') return null
  actual = actual || {} // guard explicit null (default only applies to undefined)
  const isPara = target.type === 'paragraphs'
  const n = isPara ? (actual.paragraphs ?? 0) : (actual.words ?? 0)
  const min = typeof target.min === 'number' ? target.min : null
  const max = typeof target.max === 'number' ? target.max : null
  const single = typeof target.target === 'number' ? target.target : null
  const floor = min ?? single // the number to reach for "met"
  const met = floor != null ? n >= floor : (max != null ? n > 0 && n <= max : false)
  const goalDisplay = (min != null && max != null) ? `${min}–${max}` : String(max ?? min ?? single ?? '?')
  const goalNum = String(max ?? single ?? min ?? '?')
  return isPara
    ? { full: `${n} / ${goalDisplay} paragraphs`, short: `${n}/${goalNum}¶`, met }
    : { full: `${n} / ${goalDisplay} words`, short: `${n}/${goalNum}w`, met }
}

// Server helper: recompute actual from the session's paragraphs and persist it
// back onto sessions.requirements. No-op when the session has no requirements
// (or the column doesn't exist yet — fails closed, never throws to the caller).
// Pass any Supabase client that can read/write this session under RLS.
export async function persistRequirementsActual(supabase, sessionId) {
  if (!sessionId) return
  try {
    const { data: session, error } = await supabase
      .from('sessions').select('requirements').eq('id', sessionId).single()
    if (error) return
    const reqs = session?.requirements
    if (!reqs || !Array.isArray(reqs.targets) || reqs.targets.length === 0) return

    const { data: paragraphs, error: pErr } = await supabase
      .from('paragraphs').select('scribed_text').eq('session_id', sessionId)
    // Don't clobber a good actual with zeros on a transient read failure.
    if (pErr) return

    const actual = computeActual(paragraphs)
    await supabase.from('sessions')
      .update({ requirements: { ...reqs, actual } })
      .eq('id', sessionId)
  } catch (e) {
    console.error('[persistRequirementsActual] skipped:', e?.message)
  }
}
