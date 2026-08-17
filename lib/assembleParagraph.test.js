import { describe, it, expect, vi, beforeEach } from 'vitest'

// The assembled paragraph BECOMES `paragraphs.scribed_text` — the student's Final Draft,
// what a teacher reads, what the word count measures. So the failure that matters here is
// not a wrong paragraph, it is a SHORT one written silently over a complete piece of work.
//
// Found 2026-08-16 with a real student mid-session: she had 1,227 words of confirmed
// components and this ceiling was 600 tokens (~450 words). Pressing Assemble would have
// saved roughly a third of her story, with no error and no log.

const create = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { constructor() { this.messages = { create } } },
}))
vi.mock('@/lib/usage', () => ({ logAnthropicUsage: vi.fn() }))

const { assembleParagraphText, AssemblyTruncatedError } = await import('./assembleParagraph.js')

const COMPONENTS = [
  { id: 'hook', label: 'Hook', text: 'The nest is soft under her belly.' },
  { id: 'body', label: 'Body', text: 'They hopped out and scrambled to the ground.' },
]

beforeEach(() => create.mockReset())

describe('assembleParagraphText', () => {
  it('returns the assembled paragraph on a normal completion', async () => {
    create.mockResolvedValue({
      content: [{ text: '  The nest is soft. They hopped out.  ' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    })
    const { assembled, componentText } = await assembleParagraphText({ components: COMPONENTS })
    expect(assembled).toBe('The nest is soft. They hopped out.')
    expect(componentText).toContain('Hook:')
  })

  // THE ONE THAT MATTERS. A truncated response is a perfectly successful API call — it
  // arrives with content and no error, carrying stop_reason 'max_tokens'. Checking the
  // absence of an exception would pass here and write the fragment.
  it('THROWS on stop_reason max_tokens instead of returning a fragment', async () => {
    create.mockResolvedValue({
      content: [{ text: 'The nest is soft under her belly. They hopped out and' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 10, output_tokens: 4000 },
    })
    await expect(assembleParagraphText({ components: COMPONENTS }))
      .rejects.toThrow(AssemblyTruncatedError)
  })

  it('the error carries a code the route can branch on, and the word count reached', async () => {
    create.mockResolvedValue({
      content: [{ text: 'one two three four five' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    await expect(assembleParagraphText({ components: COMPONENTS })).rejects.toMatchObject({
      code: 'assembly_truncated',
      message: expect.stringContaining('5 words'),
    })
  })

  it('does not throw on other stop reasons — only truncation is unsafe to save', async () => {
    for (const stop_reason of ['end_turn', 'stop_sequence', null, undefined]) {
      create.mockResolvedValue({
        content: [{ text: 'a complete paragraph.' }],
        stop_reason,
        usage: { input_tokens: 1, output_tokens: 1 },
      })
      await expect(assembleParagraphText({ components: COMPONENTS })).resolves.toBeTruthy()
    }
  })

  it('never calls the model with nothing to assemble', async () => {
    const r = await assembleParagraphText({ components: [{ id: 'a', label: 'A', text: '   ' }] })
    expect(r).toEqual({ assembled: '', componentText: '' })
    expect(create).not.toHaveBeenCalled()
  })

  // The ceiling bounds the STUDENT'S paragraph, not the model's commentary — the system
  // prompt forbids adding anything, so output length is their input length. 600 tokens was
  // ~450 words, below a normal high-school section.
  it('asks for enough room for a long section', async () => {
    create.mockResolvedValue({
      content: [{ text: 'ok.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 },
    })
    await assembleParagraphText({ components: COMPONENTS })
    expect(create.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(4000)
  })
})
