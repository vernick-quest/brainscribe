import { describe, it, expect } from 'vitest'
import {
  THEME_STORAGE_KEY, THEME_ORDER, THEME_INIT_SCRIPT,
  normalizeTheme, nextTheme, themeAttribute, resolveTheme,
} from './themePreference'

describe('normalizeTheme', () => {
  it.each(THEME_ORDER)('passes %s through', t => expect(normalizeTheme(t)).toBe(t))

  // localStorage is shared with other tabs, older builds and the console, so the
  // stored value is untrusted input. Anything unrecognised must fall back to
  // following the device rather than picking a theme or throwing.
  it.each([undefined, null, '', 'DARK', 'Dark', 'auto', 'os', '{}', 0, false, [], {}])(
    'falls back to system for %o', v => expect(normalizeTheme(v)).toBe('system'))
})

describe('nextTheme', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })

  it('returns to the start after one full lap', () => {
    let t = 'system'
    for (let i = 0; i < THEME_ORDER.length; i++) t = nextTheme(t)
    expect(t).toBe('system')
  })

  it('recovers from a corrupt value instead of getting stuck', () => {
    expect(nextTheme('nonsense')).toBe('light')
  })
})

describe('themeAttribute', () => {
  it('writes the explicit choices', () => {
    expect(themeAttribute('dark')).toBe('dark')
    expect(themeAttribute('light')).toBe('light')
  })

  // The bug this prevents: leaving data-theme="dark" behind when the reader goes
  // back to System pins them to dark forever and the OS switch stops working.
  it('returns null for system, so the attribute is REMOVED not set', () => {
    expect(themeAttribute('system')).toBeNull()
    expect(themeAttribute('garbage')).toBeNull()
  })
})

describe('resolveTheme', () => {
  it('follows the device on system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('overrides the device when the reader chose explicitly', () => {
    expect(resolveTheme('dark', false)).toBe('dark')   // dark on a light machine
    expect(resolveTheme('light', true)).toBe('light')  // light on a dark machine
  })
})

describe('THEME_INIT_SCRIPT', () => {
  // It runs blocking in <head> before React exists. A throw there takes the whole
  // page down, and a missing guard means a flash of the wrong theme.
  it('is wrapped in try/catch — localStorage THROWS in some privacy modes', () => {
    expect(THEME_INIT_SCRIPT).toContain('try{')
    expect(THEME_INIT_SCRIPT).toContain('catch')
  })

  it('reads the same key the component writes', () => {
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY))
  })

  it('only ever sets the two explicit values, never "system"', () => {
    expect(THEME_INIT_SCRIPT).not.toContain('system')
  })

  it('has no closing script tag that could break out of the inline <script>', () => {
    expect(THEME_INIT_SCRIPT.toLowerCase()).not.toContain('</script')
  })

  // Actually run it against a fake window for each stored value, rather than
  // trusting that the string looks right.
  it.each([
    ['dark', 'dark'],
    ['light', 'light'],
    ['system', null],
    [null, null],
    ['tampered', null],
  ])('stored %o → data-theme %o', (stored, expected) => {
    let attr = null
    const scope = {
      localStorage: { getItem: () => stored },
      document: { documentElement: { setAttribute: (_, v) => { attr = v } } },
    }
    new Function('localStorage', 'document', THEME_INIT_SCRIPT)(scope.localStorage, scope.document)
    expect(attr).toBe(expected)
  })

  it('survives a localStorage that throws, leaving the OS default in charge', () => {
    let attr = null
    const ls = { getItem() { throw new Error('SecurityError: access denied') } }
    const doc = { documentElement: { setAttribute: (_, v) => { attr = v } } }
    expect(() => new Function('localStorage', 'document', THEME_INIT_SCRIPT)(ls, doc)).not.toThrow()
    expect(attr).toBeNull()
  })
})
