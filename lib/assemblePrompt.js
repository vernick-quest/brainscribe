// lib/assemblePrompt.js — the assembler's prompt, PURE.
//
// Separated from lib/assembleParagraph.js (which imports '@/lib/usage' and so cannot be
// loaded outside Next) for one reason: the fidelity harness and the unit tests must
// exercise the STRING THAT SHIPS. A harness carrying its own copy of a prompt tests its
// own copy — the failure mode this codebase hit four times in two days.

// Types whose text is a STORY. Their paragraphing is authorial: where a scene breaks, where
// a line of dialogue sits alone, where a beat lands. There is nothing to "smooth" between
// components, and any joining prose would be the coach writing narrative for the student.
const VERBATIM_TYPES = new Set(['narrative', 'custom', 'personal_statement'])

export const isVerbatimType = t => VERBATIM_TYPES.has(String(t ?? '').toLowerCase())

// The rule both assemblers now carry. Sierra's 1,227-word section came back with 29 line
// breaks she did not write — one flow restructured into ~30 paragraphs. That is the most
// visible possible change to a story, and nothing in either prompt forbade it.
// The prose pass's PURPOSE is to produce one paragraph out of several components, so it
// cannot also promise to preserve every break — those two instructions contradict, and the
// model resolves the contradiction by collapsing everything (measured: 0 of 10 interior
// breaks survived while the rule claimed to protect them). What it can promise coherently,
// and what Sierra's +29 breaks actually needed, is that it never INVENTS structure.
const PARAGRAPH_STRUCTURE_RULE = `- NEVER insert a paragraph break. The result is ONE paragraph, however many components went in. Splitting the student's writing into paragraphs they did not write is the most visible way to alter a piece of writing, and it is never yours to do — not to "improve readability", not because the passage is long. If a passage seems too long to be one paragraph, that is a signal it belongs in more than one SECTION, which is the student's call and not yours to make here.`

export const ASSEMBLE_SYSTEM_PROSE = `You are a faithful scribe. Your only job is to flow the provided paragraph components into a single, cohesive paragraph.

STRICT RULES:
- Use ONLY the ideas and words provided in the components.
- Do NOT add arguments, transitions, evidence, or ideas that do not appear in the components.
- Do NOT remove any of the student's ideas.
- Reproduce the student's sentences VERBATIM. You may fix an outright spelling mistake, and you may adjust a word AT THE SEAM where one component meets the next so the join reads smoothly. Nothing else. You are not editing the interiors of their sentences.
- Do NOT combine or split the student's sentences, and do NOT change their punctuation — ellipses, dashes, fragments, sentence length and deliberate lowercase are all choices they made. Leave every one of them.
${PARAGRAPH_STRUCTURE_RULE}
- Preserve the student's natural voice and vocabulary.
- Output ONLY the assembled paragraph — no commentary, no labels, no preamble.`

// Stories get NO smoothing at all. The prose prompt's one licence — adjusting a word at a
// component seam — is still a licence to write, and in a narrative the "seam" between a
// hook and a body is a place the author already chose how to cross.
export const ASSEMBLE_SYSTEM_VERBATIM = `You are a faithful scribe. Your only job is to join the provided pieces of the student's story into one continuous passage, EXACTLY as they wrote them.

STRICT RULES:
- Reproduce every piece VERBATIM, word for word, in the order given. This is a transcription task, not an editing task.
- Do NOT add transitions, connective phrases, or ANY words of your own — not even one. There is nothing to smooth: the student already chose how their story moves.
- Do NOT combine or split sentences. Do NOT change punctuation. Ellipses, dashes, fragments, one-word sentences and unusual spacing are the author's choices — every one of them stays.
- Do NOT change the CAPITALISATION of any word. If a sentence begins with a lowercase letter, it still begins with a lowercase letter in your output. Capitalising it is exactly the kind of tidy-up that makes a student say their writing was changed — and in a story a lowercase opening is a voice, not a mistake.
- Do NOT "fix" style, tighten wording, or improve anything. Even an obvious spelling slip stays, because in a story it may be a character's voice.
- NEVER add, remove, or move a paragraph break ANYWHERE — inside a piece or between pieces. The blank lines are the student's; reproduce every one of them exactly where it is. Re-paragraphing is the most visible way to alter a piece of writing and it is never yours to do.
- Output ONLY the joined passage — no commentary, no labels, no preamble.`

export function assembleSystemFor(paragraphType) {
  return isVerbatimType(paragraphType) ? ASSEMBLE_SYSTEM_VERBATIM : ASSEMBLE_SYSTEM_PROSE
}

/**
 * The labelled component block, and the instruction that carries it.
 *
 * "into a single flowing paragraph" was asked of a 1,227-word STORY. One paragraph is the
 * wrong shape for that, so the model overrode the instruction — and restructured her text
 * on the way. A story is asked to be JOINED, never re-shaped.
 */
export function buildAssembleUserMessage({ components, paragraphType }) {
  const componentText = (components ?? [])
    .filter(c => c.text?.trim())
    .map(c => `${c.label}: ${c.text}`)
    .join('\n\n')
  if (!componentText) return { componentText, userMessage: '' }

  const userMessage = isVerbatimType(paragraphType)
    ? `Join these pieces of the student's story into one continuous passage, reproducing every word and every line break exactly as written:\n\n${componentText}`
    : `Assemble these ${paragraphType ?? 'prose'} paragraph components into a single flowing paragraph:\n\n${componentText}`

  return { componentText, userMessage }
}
