import { describe, it, expect } from 'vitest'
import { inferWritingMode, WRITING_MODES } from '@/lib/writingMode'

// The column exists because absence is ambiguous. These tests exist to keep it that way:
// `targets: []` means EITHER "no requirements" OR "the pass never ran", and every bug in
// this area comes from resolving that in the flattering direction.

describe('inferWritingMode — the ambiguity guard', () => {
  it('returns unknown whenever the meta pass did not run, however empty things look', () => {
    for (const metaRan of [false, undefined, null, 'true', 1]) {
      expect(inferWritingMode({ metaRan, requirements: [], assignmentText: '' })).toBe('unknown')
    }
  })

  it('does NOT read a failed pass on personal-looking text as personal', () => {
    // The exact trap: text that would otherwise be positive evidence must still not
    // produce an answer when nothing actually assessed it.
    expect(inferWritingMode({
      metaRan: false, requirements: [], assignmentText: 'i just want to write something for fun',
    })).toBe('unknown')
  })

  it('never infers personal from absence alone', () => {
    // No targets, no markers — genuinely ambiguous. A one-line brief given verbally by a
    // teacher looks exactly like this.
    expect(inferWritingMode({ metaRan: true, requirements: [], assignmentText: 'Write about the ocean.' })).toBe('unknown')
    expect(inferWritingMode({ metaRan: true, requirements: [], assignmentText: '' })).toBe('unknown')
  })
})

describe('inferWritingMode — school evidence', () => {
  it('treats any numeric target as a brief someone set', () => {
    for (const t of [
      { type: 'words', min: 300, max: 400 },
      { type: 'paragraphs', target: 5 },
      { type: 'chars', max: 1600 },
    ]) {
      expect(inferWritingMode({ metaRan: true, requirements: [t], assignmentText: 'Write something.' })).toBe('school')
    }
  })

  it("recognises a teacher's language with no targets at all", () => {
    const briefs = [
      'Persuasive essay on school uniforms. Due Friday.',
      'See the rubric attached.',
      'Mrs. Alvarez — English 7',
      'Write five paragraphs about the Civil War',
      'Include a thesis statement and cite two sources (MLA).',
      'Lab report on osmosis',
      'Finish the worksheet for homework',
    ]
    for (const text of briefs) {
      expect(inferWritingMode({ metaRan: true, requirements: [], assignmentText: text })).toBe('school')
    }
  })

  it('lets school evidence beat a sample-library prompt', () => {
    // A curated prompt can still be handed out by a teacher, and mislabelling graded work
    // as personal is the costlier error — it drops the requirement language.
    expect(inferWritingMode({
      metaRan: true, requirements: [{ type: 'words', min: 300 }],
      assignmentText: 'Write a poem about winter', fromSampleLibrary: true,
    })).toBe('school')
  })
})

describe('inferWritingMode — personal evidence', () => {
  it('accepts a prompt that came from our own chooser', () => {
    expect(inferWritingMode({
      metaRan: true, requirements: [], assignmentText: 'Write a poem about a place you love',
      fromSampleLibrary: true,
    })).toBe('personal')
  })

  it("accepts the student saying it in their own words", () => {
    for (const text of [
      'no requirements, I just want to write something',
      'writing my own story for fun',
      'this is not for school',
    ]) {
      expect(inferWritingMode({ metaRan: true, requirements: [], assignmentText: text })).toBe('personal')
    }
  })
})

describe('inferWritingMode — contract', () => {
  it('only ever returns a value the check constraint allows', () => {
    const inputs = [
      {}, { metaRan: true }, { metaRan: true, requirements: null, assignmentText: null },
      { metaRan: true, assignmentText: 'essay', fromSampleLibrary: true },
      { metaRan: true, requirements: 'nonsense' },
    ]
    for (const i of inputs) expect(WRITING_MODES).toContain(inferWritingMode(i))
  })
})
