import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import ThemePreferenceControl from './ThemePreferenceControl'

// ── Markup contract ────────────────────────────────────────────────────────────────
describe('ThemePreferenceControl — markup', () => {
  const html = renderToStaticMarkup(<ThemePreferenceControl />)

  it('is a labelled group of three real radios sharing one name', () => {
    expect(html).toMatch(/<fieldset/)
    expect(html).toMatch(/<legend[^>]*>Theme<\/legend>/)
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? []
    expect(radios).toHaveLength(3)
    const names = new Set(radios.map(r => r.match(/name="([^"]+)"/)?.[1]))
    expect(names.size).toBe(1)
    expect([...names][0]).toBeTruthy()
  })

  it('offers System, Light and Dark', () => {
    for (const v of ['system', 'light', 'dark']) expect(html).toContain(`value="${v}"`)
    for (const l of ['System', 'Light', 'Dark']) expect(html).toContain(`>${l}<`)
  })

  it('renders SYSTEM checked on the server, where no preference is readable', () => {
    // Same reason as the header button: anything else is a hydration mismatch.
    const checked = html.match(/<input[^>]*checked[^>]*>/g) ?? []
    expect(checked).toHaveLength(1)
    expect(checked[0]).toContain('value="system"')
  })

  it('says the setting is per-browser and shared with the header button', () => {
    expect(html).toMatch(/aria-describedby="[^"]+"/)
    expect(html).toContain('not your account')
    expect(html).toContain('top of every page')
  })

  it('keeps 44px tap targets and styles through theme tokens', () => {
    expect(html).toContain('min-height:var(--tap-min)')
    expect(html).toMatch(/var\(--surface-ink\)/)
    expect(html).toMatch(/var\(--border-strong\)/)
  })

  it('draws a focus ring on the visible tile, since the radio itself is hidden', () => {
    expect(html).toContain('theme-choice')
    const css = readFileSync(join(import.meta.dirname, '..', 'app/globals.css'), 'utf8')
    expect(css).toMatch(/\.theme-choice:has\(input:focus-visible\)\s*\{[^}]*outline:/)
  })
})

// ── One store, two controls (source-level, like lib/wiring.test.js) ────────────────
// There is no DOM in this suite, so "the header and settings controls read the same
// store" cannot be exercised by rendering them together. It IS exercised against
// fakes in lib/themePreference.test.js ("two controls, one setting"). What is held
// HERE is that both real controls are actually wired to that path — and that no file
// grows a second one. A future control with its own localStorage key or its own
// data-theme write fails this suite instead of shipping two truths.
const ROOT = join(import.meta.dirname, '..')
const read = f => readFileSync(join(ROOT, f), 'utf8')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(js|jsx|ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(relative(ROOT, p))
  }
  return out
}
const SOURCES = ['app', 'components', 'lib'].flatMap(d => walk(join(ROOT, d)))

describe('theme controls — one store, no second path', () => {
  const CONTROLS = ['components/ThemeToggle.js', 'components/ThemePreferenceControl.js']

  it.each(CONTROLS)('%s reads and writes ONLY through useThemePreference', f => {
    const src = read(f)
    expect(src).toMatch(/import useThemePreference from '@\/components\/useThemePreference'/)
    expect(src).toMatch(/=\s*useThemePreference\(\)/)
    // Strip comments so the explanatory prose doesn't count as code.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/localStorage/)
    expect(code).not.toMatch(/data-theme['"]/)
    expect(code).not.toMatch(/THEME_STORAGE_KEY/)
  })

  it('the hook writes through setThemePreference and listens through subscribeThemePreference', () => {
    const src = read('components/useThemePreference.js')
    expect(src).toMatch(/from '@\/lib\/themePreference'/)
    expect(src).toMatch(/setThemePreference\(/)
    expect(src).toMatch(/subscribeThemePreference\(/)
    expect(src).toMatch(/currentThemePreference\(/)
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/localStorage\./)
    expect(code).not.toMatch(/(set|remove)Attribute\(/)
  })

  // The sweep. Fingerprints of a theme store: the storage key (by name or literal)
  // and any write of the data-theme attribute. Only the module itself and the root
  // layout (which injects THEME_INIT_SCRIPT) may carry them.
  const ALLOWED = new Set(['lib/themePreference.js', 'app/layout.js'])
  const FINGERPRINT = /THEME_STORAGE_KEY|['"`]bs-theme['"`]|(set|remove)Attribute\(\s*['"]data-theme/

  it('the sweep actually finds the module (positive control)', () => {
    // A sweep that silently matched nothing would pass forever.
    expect(SOURCES.length).toBeGreaterThan(50)
    const hits = SOURCES.filter(f => FINGERPRINT.test(read(f)))
    expect(hits).toContain('lib/themePreference.js')
  })

  it('no other file touches the theme store directly', () => {
    const offenders = SOURCES.filter(f => !ALLOWED.has(f) && FINGERPRINT.test(read(f)))
    expect(offenders, `second theme-store path in: ${offenders.join(', ')}`).toEqual([])
  })
})

// ── Only on the viewer's OWN page ──────────────────────────────────────────────────
// The theme is this browser's preference. On someone else's profile — a parent or
// teacher viewing a student at /profile/[studentId], or an admin remoting in — it
// would read as THEIR setting, and look like a watcher changing a student's theme.
describe('settings control placement', () => {
  // Non-global for .test() (a /g regex carries lastIndex between files); a fresh
  // /g one for counting.
  const MOUNT = /<ThemePreferenceControl\b/
  const count = src => (src.match(/<ThemePreferenceControl\b/g) ?? []).length

  it('is mounted in exactly two places: the student/teacher/admin profile and parent settings', () => {
    const mounts = SOURCES.filter(f => f !== 'components/ThemePreferenceControl.js' && MOUNT.test(read(f)))
    expect(mounts.sort()).toEqual(['app/profile/page.js', 'components/ParentSettings.js'])
  })

  it('/profile mounts it once, and only when NOT impersonating', () => {
    const src = read('app/profile/page.js')
    expect(count(src)).toBe(1)
    expect(src).toMatch(/\{!imp && \([\s\S]{0,900}<ThemePreferenceControl \/>/)
  })

  it('parent settings mounts it once, and only when NOT impersonating', () => {
    const src = read('components/ParentSettings.js')
    expect(count(src)).toBe(1)
    expect(src).toMatch(/\{!impersonating && \([\s\S]{0,900}<ThemePreferenceControl \/>/)
  })

  it('never appears on a watcher\'s view of a student\'s profile', () => {
    const src = read('app/profile/[studentId]/page.js')
    expect(src).not.toMatch(/ThemePreferenceControl|useThemePreference|themePreference/)
  })
})
