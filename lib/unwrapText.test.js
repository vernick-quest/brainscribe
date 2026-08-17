import { describe, it, expect } from 'vitest'
import { unwrapPastedText } from './unwrapText'

describe('unwrapPastedText', () => {
  it('joins lines broken only to fit a column', () => {
    const pasted = [
      'Root cause confirmed: prompt seam, not coach drift. Rule 13\'s editing pass',
      'carried an explicit "does not conflict with Rule 11" exemption, so the revision',
      'path bypassed the composition-drift tripwire.',
    ].join('\n')
    expect(unwrapPastedText(pasted)).toBe(
      'Root cause confirmed: prompt seam, not coach drift. Rule 13\'s editing pass ' +
      'carried an explicit "does not conflict with Rule 11" exemption, so the revision ' +
      'path bypassed the composition-drift tripwire.'
    )
  })

  it('preserves blank-line paragraph breaks', () => {
    const out = unwrapPastedText('one line\nwrapped on\n\nsecond para\nalso wrapped')
    expect(out).toBe('one line wrapped on\n\nsecond para also wrapped')
  })

  it('keeps list items on their own lines', () => {
    const out = unwrapPastedText('Findings:\n- first item\n- second item\n1. numbered\n2. also numbered')
    expect(out).toBe('Findings:\n- first item\n- second item\n1. numbered\n2. also numbered')
  })

  it('keeps indented and quoted blocks intact', () => {
    const out = unwrapPastedText('intro\n  indented code\n> a quoted line')
    expect(out).toBe('intro\n  indented code\n> a quoted line')
  })

  it('rejoins a hyphen-split word without inserting a space', () => {
    expect(unwrapPastedText('composi-\ntion drift')).toBe('composition drift')
  })

  it('normalizes CRLF and collapses 3+ blank lines', () => {
    expect(unwrapPastedText('a\r\nb\r\n\r\n\r\n\r\nc')).toBe('a b\n\nc')
  })

  it('leaves already-unwrapped text alone', () => {
    const single = 'A single long line that was never hard wrapped at all.'
    expect(unwrapPastedText(single)).toBe(single)
  })

  it('handles empty / non-string input without throwing', () => {
    expect(unwrapPastedText('')).toBe('')
    expect(unwrapPastedText(null)).toBe('')
    expect(unwrapPastedText(undefined)).toBe('')
  })
})
