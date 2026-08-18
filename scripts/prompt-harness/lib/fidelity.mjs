// Byte-level fidelity metrics for the assembly passes, plus the fixture they run on.
//
// SEPARATE MODULE because two things need them: the permanent gate
// (scripts/prompt-harness/assembly-fidelity.mjs) and any one-off baseline comparison. A
// second copy of the metric would let the baseline and the gate disagree about what
// "preserved" means, which is the whole thing being measured.
//
// Fixture is SYNTHETIC (this repo is public — no real student writing in tracked files),
// but built to carry exactly the features that were reported lost or at risk:
//   · ellipses            · em dash and en dash        · sentence fragments
//   · deliberate lowercase · dialogue on its own lines  · real paragraph breaks
//   · a one-word sentence  · an intentional misspelling in a character's voice

export const FIXTURE_COMPONENTS = [
  {
    id: 'hook', label: 'hook',
    text: 'The oak went quiet before the cold came. Not slowly. All at once, the way a room goes quiet when someone says the wrong thing.',
  },
  {
    id: 'context', label: 'context',
    text: 'Pip had counted the acorns twice — four, then four again — and both times the answer felt like a door closing.\n\nhis mother used to say the early cold never goes back. She said it the way you say a thing you hope is a story.',
  },
  {
    id: 'body', label: 'body',
    text: '"You could wait," said the wren, who had never been hungry a day in her life.\n\n"I could," Pip said. "I could wait untill the waiting does it for me."\n\nThe field lay between him and the walnut trees, wide and bright and completely without cover. Somewhere past it — he could not see it, but he knew — the hawk sat on the fence post and was patient in the way only well-fed things can be.\n\nHe thought about his mother crossing it. She had told it afterwards like a funny story… and he understood only now that she had chosen to tell it that way.',
  },
  {
    id: 'closing', label: 'closing',
    text: 'Pip stepped out of the hollow.\n\nThe light was thin and the ground was hard and the walnut trees did not look any closer than they had from up in the branches. He went anyway.',
  },
]

export const FIXTURE_TEXT = FIXTURE_COMPONENTS.map(c => c.text).join('\n\n')

const count = (s, re) => (String(s).match(re) ?? []).length

/** The measurable surface of a piece of writing — every one of these is an authorial choice. */
export function fidelityMetrics(text) {
  const t = String(text ?? '')
  return {
    ellipses:      count(t, /(?:\.\.\.|…)/g),
    dashes:        count(t, /[—–]/g),
    sentenceEnds:  count(t, /[.!?]/g),
    quoteMarks:    count(t, /["“”]/g),
    lineBreaks:    count(t, /\n/g),
    words:         t.trim() ? t.trim().split(/\s+/).length : 0,
  }
}

/**
 * Normalised word shingles, for "how much of their actual phrasing survived".
 *
 * ⚠️ BLIND TO CASE, by design — it measures PHRASING, and lowercasing keeps a legitimate
 * seam edit from reading as a rewrite. It therefore scored 100% on a run that silently
 * capitalised a deliberate lowercase sentence opening. Case is checked separately and
 * explicitly; do not read a high survival number as "nothing changed".
 */
export function shingles(text, n = 8) {
  const words = String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const out = new Set()
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '))
  return out
}

/** Fraction of the STUDENT's shingles that still appear in the output. */
export function shingleSurvival(original, assembled, n = 8) {
  const a = shingles(original, n)
  if (a.size === 0) return 1
  const b = shingles(assembled, n)
  let kept = 0
  for (const s of a) if (b.has(s)) kept++
  return { kept, total: a.size, fraction: kept / a.size }
}

export function diffMetrics(before, after) {
  const A = fidelityMetrics(before), B = fidelityMetrics(after)
  return Object.fromEntries(Object.keys(A).map(k => [k, { before: A[k], after: B[k], delta: B[k] - A[k] }]))
}
