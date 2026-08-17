import { describe, it, expect, vi, afterEach } from 'vitest'
import { assertComplete, responseText, ModelTruncatedError } from './modelResponse.js'

// A truncated completion is a SUCCESSFUL API call: content present, no error, just
// stop_reason 'max_tokens'. Every caller that checks try/catch or "did I get text?"
// sails past it and saves the fragment. That is how a student's Final Draft nearly
// became a third of her story on 2026-08-16 — it fails in the reassuring direction.

const reply = (text, stop_reason) => ({ content: [{ text }], stop_reason })

afterEach(() => vi.restoreAllMocks())

describe('assertComplete', () => {
  it('passes a normal completion straight through', () => {
    const r = reply('a finished paragraph.', 'end_turn')
    expect(assertComplete(r)).toBe(r)
  })

  it('THROWS on max_tokens — the whole point', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => assertComplete(reply('cut off mid sen', 'max_tokens')))
      .toThrow(ModelTruncatedError)
  })

  // Being stricter would break every caller for no safety gain: these are all normal
  // ways for a reply to end.
  it('does NOT throw on end_turn, stop_sequence, null or missing', () => {
    for (const stop of ['end_turn', 'stop_sequence', null, undefined]) {
      expect(() => assertComplete(reply('fine.', stop))).not.toThrow()
    }
  })

  it('carries a branchable code, the word count reached, and context', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      assertComplete(reply('one two three four', 'max_tokens'), { what: 'the essay', sessionId: 's1' })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e.code).toBe('model_truncated')
      expect(e.words).toBe(4)
      expect(e.what).toBe('the essay')
      expect(e.sessionId).toBe('s1')
      expect(e.message).toContain('the essay')
    }
  })

  // Silence is how the first truncation went unnoticed for a whole session.
  it('logs loudly when it refuses', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => assertComplete(reply('x', 'max_tokens'), { what: 'dictation' })).toThrow()
    expect(err).toHaveBeenCalledWith(expect.stringContaining('[model-truncated]'))
  })

  it('survives a malformed response rather than throwing the wrong error', () => {
    for (const bad of [null, undefined, {}, { content: [] }, { content: [{}] }]) {
      expect(() => assertComplete(bad)).not.toThrow()
    }
    expect(responseText(null)).toBe('')
    expect(responseText({ content: [{ text: 'hi' }] })).toBe('hi')
  })

  it('counts zero words rather than NaN when the cut left nothing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      assertComplete(reply('   ', 'max_tokens'))
    } catch (e) {
      expect(e.words).toBe(0)
    }
  })
})
