import { describe, it, expect } from 'vitest'
import {
  ASSEMBLE_SYSTEM_PROSE, ASSEMBLE_SYSTEM_VERBATIM,
  assembleSystemFor, buildAssembleUserMessage, isVerbatimType,
} from './assemblePrompt.js'

// Gate 1 ($0) for the assembly-fidelity work. These assert on the STRING THE MODEL IS
// HANDED; scripts/prompt-harness/assembly-fidelity.mjs then proves the model ACTS on it.
// A rule can sit in a prompt and never fire — that is why both layers exist.

describe('type routing', () => {
  it('sends stories to the verbatim prompt', () => {
    for (const t of ['narrative', 'custom', 'personal_statement', 'NARRATIVE']) {
      expect(isVerbatimType(t)).toBe(true)
      expect(assembleSystemFor(t)).toBe(ASSEMBLE_SYSTEM_VERBATIM)
    }
  })

  it('leaves essay prose on the smoothing prompt', () => {
    for (const t of ['body', 'introduction', 'conclusion', undefined, null, '']) {
      expect(isVerbatimType(t)).toBe(false)
      expect(assembleSystemFor(t)).toBe(ASSEMBLE_SYSTEM_PROSE)
    }
  })
})

describe('the unbounded licence is gone', () => {
  it('neither prompt still says "smooth transitions between components"', () => {
    // The exact clause that contradicted coach Rule 6 and let the assembler rewrite
    // anywhere. Sierra's coach truthfully said it had not changed her writing; this had.
    for (const p of [ASSEMBLE_SYSTEM_PROSE, ASSEMBLE_SYSTEM_VERBATIM]) {
      expect(p).not.toMatch(/smooth transitions between components/)
    }
  })

  it('the story prompt grants no editing licence at all', () => {
    expect(ASSEMBLE_SYSTEM_VERBATIM).toMatch(/VERBATIM, word for word/)
    expect(ASSEMBLE_SYSTEM_VERBATIM).toMatch(/not even one/)
    // Even spelling: in a story a slip may be a character's voice.
    expect(ASSEMBLE_SYSTEM_VERBATIM).toMatch(/Even an obvious spelling slip stays/)
  })

  it('the prose prompt bounds edits to component seams', () => {
    expect(ASSEMBLE_SYSTEM_PROSE).toMatch(/AT THE SEAM where one component meets the next/)
    expect(ASSEMBLE_SYSTEM_PROSE).toMatch(/not editing the interiors of their sentences/)
  })
})

describe('paragraph structure — the measured defect', () => {
  it('the story prompt forbids adding, removing OR moving a break', () => {
    expect(ASSEMBLE_SYSTEM_VERBATIM).toMatch(/NEVER add, remove, or move a paragraph break ANYWHERE/)
  })

  it('the prose prompt forbids INSERTING one', () => {
    // It cannot honestly promise preservation — producing one paragraph from several
    // components IS its job. Claiming both made the model collapse everything anyway.
    expect(ASSEMBLE_SYSTEM_PROSE).toMatch(/NEVER insert a paragraph break/)
    expect(ASSEMBLE_SYSTEM_PROSE).toMatch(/result is ONE paragraph/)
  })

  it('both forbid merging or splitting the student\'s sentences', () => {
    for (const p of [ASSEMBLE_SYSTEM_PROSE, ASSEMBLE_SYSTEM_VERBATIM]) {
      expect(p).toMatch(/Do NOT combine or split/)
    }
  })

  it('the story prompt protects capitalisation explicitly', () => {
    // Measured: a run silently capitalised a deliberate lowercase opening, and the shingle
    // metric could not see it (shingles lowercase by design).
    expect(ASSEMBLE_SYSTEM_VERBATIM).toMatch(/Do NOT change the CAPITALISATION/)
  })
})

describe('buildAssembleUserMessage', () => {
  const components = [
    { id: 'hook', label: 'hook', text: 'One.' },
    { id: 'body', label: 'body', text: 'Two.\n\nThree.' },
  ]

  it('asks a story to be JOINED, never re-shaped', () => {
    const { userMessage } = buildAssembleUserMessage({ components, paragraphType: 'narrative' })
    expect(userMessage).toMatch(/Join these pieces/)
    expect(userMessage).toMatch(/exactly as written/)
    // "a single flowing paragraph" asked of a 1,227-word story is an absurd instruction,
    // so the model overrode it — and restructured her text on the way.
    expect(userMessage).not.toMatch(/single flowing paragraph/)
  })

  it('still asks essay prose for one flowing paragraph', () => {
    const { userMessage } = buildAssembleUserMessage({ components, paragraphType: 'body' })
    expect(userMessage).toMatch(/single flowing paragraph/)
  })

  it('carries the component text verbatim, labels and newlines intact', () => {
    const { componentText, userMessage } = buildAssembleUserMessage({ components, paragraphType: 'narrative' })
    expect(componentText).toBe('hook: One.\n\nbody: Two.\n\nThree.')
    expect(userMessage).toContain(componentText)
  })

  it('returns empty for no usable components, so the caller can skip the call', () => {
    for (const c of [[], null, undefined, [{ label: 'hook', text: '   ' }]]) {
      expect(buildAssembleUserMessage({ components: c, paragraphType: 'body' }).componentText).toBe('')
    }
  })
})
