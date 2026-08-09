// lib/theme.test.js
//
// The dark-mode gate. Dark mode is a pure token remap, which means every way it
// can break is invisible to `next build`: a semantic alias that nobody redefined
// still resolves — to a cream value on a navy page. A component that names a
// token which does not exist silently renders its hardcoded light fallback and
// looks fine in review. Both failure modes are REASSURING, so they get asserted
// here rather than eyeballed.
//
// This parses app/globals.css the way the browser resolves it (light :root, then
// the dark @media block layered on top, with var() chains followed), so the
// numbers below are read off the real stylesheet — not copied from the design doc.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSS = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')

// ── CSS parsing ────────────────────────────────────────────────────────────
/** Return the contents of the {…} block that starts at `open`, brace-matched. */
function blockAt(css, open) {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error('unbalanced braces in globals.css')
}

function declarations(block) {
  const out = {}
  // Only top-level declarations of this block (skip anything inside a nested rule).
  for (const [, name, value] of block.matchAll(/--([\w-]+)\s*:\s*([^;{}]+);/g)) {
    out[`--${name}`] = value.trim()
  }
  return out
}

const lightBlock = blockAt(CSS, CSS.indexOf('{', CSS.indexOf(':root')))
const darkMediaIdx = CSS.indexOf('@media screen and (prefers-color-scheme: dark)')
const darkMedia = blockAt(CSS, CSS.indexOf('{', darkMediaIdx))
const darkBlock = blockAt(darkMedia, darkMedia.indexOf('{', darkMedia.indexOf(':root')))

const LIGHT = declarations(lightBlock)
const DARK = { ...LIGHT, ...declarations(darkBlock) }

/** Follow var() chains until a literal remains. */
function resolve(token, vars, seen = new Set()) {
  let v = vars[token]
  if (v === undefined) return undefined
  let guard = 0
  while (v.includes('var(') && guard++ < 20) {
    v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (m, ref, fallback) => {
      if (seen.has(ref)) return fallback ?? m
      const inner = vars[ref]
      return inner !== undefined ? inner : (fallback ?? m)
    })
  }
  return v.trim()
}

// ── Contrast ───────────────────────────────────────────────────────────────
function rgb(hex) {
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
}
const chan = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = hex => { const [r, g, b] = rgb(hex); return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b) }
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Resolve a token in a theme and fail loudly if it isn't a plain hex. */
function color(token, vars, theme) {
  const v = resolve(token, vars)
  expect(v, `${token} is undefined in ${theme}`).toBeDefined()
  expect(v, `${token} did not resolve to a hex in ${theme} (got "${v}")`).toMatch(/^#[0-9a-fA-F]{3,8}$/)
  return v
}

// Real pairings the UI actually renders, not swatches. AA body text is 4.5:1;
// large text and non-text UI (rings, dots, borders) are held to 3:1.
const TEXT_PAIRS = [
  ['--text-body', '--bg-page'],
  ['--text-body', '--surface-card'],
  ['--text-strong', '--bg-page'],
  ['--text-strong', '--surface-card'],
  ['--text-muted', '--bg-page'],
  ['--text-muted', '--surface-card'],
  ['--text-link', '--bg-page'],
  ['--text-link', '--surface-card'],
  ['--accent-text', '--surface-card'],
  ['--accent-text', '--bg-page'],
  ['--accent-text', '--accent-soft'],
  ['--text-on-dark', '--surface-ink'],
  ['--text-on-dark', '--primary'],
  ['--status-success', '--status-success-bg'],
  ['--status-thin', '--status-thin-bg'],
  ['--status-error', '--status-error-bg'],
  ['--status-success', '--surface-card'],
  ['--status-thin', '--surface-card'],
  ['--status-error', '--surface-card'],
]

const UI_PAIRS = [
  ['--accent', '--bg-page'],
  ['--accent', '--surface-card'],
  ['--ring', '--bg-page'],
  ['--ring', '--surface-card'],
  ['--ring-navy', '--bg-page'],
  // Hairline borders are deliberately low-contrast in both themes; they get
  // their own visibility check below rather than a 3:1 target.
]

const COACHES = ['owen', 'deon', 'zoe', 'alistair', 'tilly', 'jade']

// The gate. Dark must clear the accessibility target, OR — where the LIGHT brand
// already falls short of it — at least match light. Several brand pairings ship
// below AA today (white on the orange CTA is 2.67:1; the amber status chip is
// 2.41:1). Those are pre-existing brand decisions, not this change's to make, and
// asserting an absolute threshold would make this file red on arrival and
// therefore useless. What it must never do is get WORSE at night.
function expectNotWorseThanLight(fg, bg, target) {
  const light = contrast(color(fg, LIGHT, 'light'), color(bg, LIGHT, 'light'))
  const dark = contrast(color(fg, DARK, 'dark'), color(bg, DARK, 'dark'))
  const floor = Math.min(target, light)
  expect(
    dark,
    `${fg} on ${bg}: dark ${dark.toFixed(2)}:1 vs light ${light.toFixed(2)}:1 (floor ${floor.toFixed(2)})`
  ).toBeGreaterThanOrEqual(floor - 0.01)
}

describe('dark mode is never worse than light', () => {
  it.each(TEXT_PAIRS)('%s on %s — text, target 4.5:1', (fg, bg) => expectNotWorseThanLight(fg, bg, 4.5))
  it.each(UI_PAIRS)('%s on %s — non-text, target 3:1', (fg, bg) => expectNotWorseThanLight(fg, bg, 3))

  it.each([
    ['--border-default', '--bg-page'],
    ['--border-default', '--surface-card'],
    ['--border-strong', '--surface-card'],
  ])('%s stays visible against %s', (fg, bg) => {
    // Hairline dividers are decorative, so WCAG 1.4.11 does not apply — but in a
    // theme where borders replace shadows as the elevation cue, an invisible
    // border is a real defect. Both themes sit near 1.3:1 by design.
    const dark = contrast(color(fg, DARK, 'dark'), color(bg, DARK, 'dark'))
    expect(dark, `${fg} on ${bg} in dark`).toBeGreaterThan(1.15)
  })
})

for (const [theme, vars] of [['light', LIGHT], ['dark', DARK]]) {
  describe(`globals.css — ${theme} theme`, () => {
    // The coach picker: name/trait ink sits on the selected card's tint, and the
    // ring sits on the plain card. This is the pairing that INVERTS between
    // themes, so it is checked in both rather than assumed to carry over.
    it.each(COACHES)('coach %s: name ink is readable on the selected card', key => {
      const shade = color(`--tutor-${key}-shade`, vars, theme)
      const tint = color(`--tutor-${key}-tint`, vars, theme)
      // Light ships Zoe at 4.41:1; hold the line there rather than restyle light.
      expect(contrast(shade, tint), `${key} shade-on-tint in ${theme}`).toBeGreaterThanOrEqual(4.4)
    })

    it('the six coaches stay mutually distinguishable', () => {
      // Perceptual distance, not luminance: two hues can share a luminance and
      // still be obviously different colors (and vice versa).
      const lab = hex => {
        const [r, g, b] = rgb(hex).map(c => chan(c))
        const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
        const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
        const Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
        const Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
        return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]
      }
      for (let i = 0; i < COACHES.length; i++) {
        for (let j = i + 1; j < COACHES.length; j++) {
          const [a, b] = [COACHES[i], COACHES[j]].map(k => lab(color(`--tutor-${k}`, vars, theme)))
          const dE = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
          expect(dE, `${COACHES[i]} vs ${COACHES[j]} in ${theme} = ΔE ${dE.toFixed(1)}`).toBeGreaterThan(15)
        }
      }
    })
  })
}

describe('globals.css is structurally valid', () => {
  // `npm run build` is NOT a gate for this file: with a malformed comment in
  // globals.css the production build PRINTS "Parsing CSS source code failed" and
  // still exits 0, while `next dev` 500s every route. Verified by deliberately
  // breaking the file and building it. So the stylesheet gets checked here.
  it('has balanced comments and braces', () => {
    let depth = 0, inComment = false
    for (let i = 0; i < CSS.length; i++) {
      if (!inComment && CSS[i] === '/' && CSS[i + 1] === '*') { inComment = true; i++ }
      else if (inComment && CSS[i] === '*' && CSS[i + 1] === '/') { inComment = false; i++ }
      else if (!inComment && CSS[i] === '*' && CSS[i + 1] === '/') {
        const line = CSS.slice(0, i).split('\n').length
        throw new Error(`stray "*/" outside a comment at globals.css:${line}`)
      }
      else if (!inComment && CSS[i] === '{') depth++
      else if (!inComment && CSS[i] === '}') depth--
      expect(depth, `brace depth went negative near globals.css:${CSS.slice(0, i).split('\n').length}`).toBeGreaterThanOrEqual(0)
    }
    expect(inComment, 'unterminated /* comment').toBe(false)
    expect(depth, 'unbalanced braces').toBe(0)
  })
})

describe('dark mode covers what it needs to', () => {
  it('redefines every semantic surface/text/brand alias', () => {
    // If an alias is missed, it keeps resolving through the LIGHT scale and a
    // cream value lands on the navy page. `next build` cannot see this.
    const mustInvert = [
      '--bg-page', '--bg-page-alt', '--surface-card', '--surface-muted', '--surface-sunken',
      '--surface-ink', '--surface-spark', '--text-strong', '--text-body', '--text-muted',
      '--text-subtle', '--text-on-dark', '--text-link', '--accent', '--accent-hover',
      '--accent-press', '--accent-soft', '--accent-text', '--primary', '--primary-hover',
      '--primary-soft', '--border-default', '--border-strong', '--border-accent',
    ]
    const missing = mustInvert.filter(t => resolve(t, LIGHT) === resolve(t, DARK))
    expect(missing, 'these still resolve to their light value in dark').toEqual([])
  })

  it('leaves the page genuinely dark and the paper genuinely light', () => {
    expect(lum(color('--bg-page', LIGHT, 'light'))).toBeGreaterThan(0.7)
    expect(lum(color('--bg-page', DARK, 'dark'))).toBeLessThan(0.1)
    expect(lum(color('--surface-card', DARK, 'dark'))).toBeLessThan(0.15)
  })

  it('is scoped to screen so printing never uses the dark palette', () => {
    // A transcript printed from a dark-mode browser would otherwise put
    // near-white body text onto the forced-white print background.
    expect(darkMediaIdx).toBeGreaterThan(-1)
    expect(CSS).not.toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/)
  })

  it('declares color-scheme so form controls and scrollbars follow', () => {
    expect(darkBlock).toMatch(/color-scheme:\s*dark/)
  })
})

describe('no component can paint a hardcoded light color', () => {
  // THE bug class this change found. Several components named tokens globals.css
  // never defined — --status-warning, --status-danger, --on-accent — each with a
  // hardcoded light hex as the fallback. The token never resolved, so the fallback
  // ALWAYS won: a #FFFBEB panel and #D97706 text, frozen light, in every theme.
  // It looked correct in review and in light mode, which is why it survived.
  //
  // An undefined token WITHOUT a literal fallback is not this bug: `color:
  // var(--text-default)` is invalid at computed-value time, so the element simply
  // inherits a themed color from its parent. Only a literal fallback can freeze a
  // color, so only that is banned.
  function walk(dir, acc = []) {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) walk(p, acc)
      else if (/\.(js|jsx|css)$/.test(entry)) acc.push(p)
    }
    return acc
  }

  const COLOR_LITERAL = /^\s*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|white|black)/

  it('no var() falls back to a color literal', () => {
    // app/api/coppa/* is exempt: those hexes are transactional EMAIL templates,
    // and email clients do not do dark mode.
    const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))]
      .filter(f => !f.includes('/app/api/coppa/'))
    const frozen = []
    for (const file of files) {
      for (const [, name, fallback] of readFileSync(file, 'utf8')
        .matchAll(/var\(\s*(--[\w-]+)\s*,\s*([^()]*?(?:\([^()]*\))?[^()]*?)\)/g)) {
        if (name.startsWith('--tw-')) continue
        if (COLOR_LITERAL.test(fallback)) {
          frozen.push(`${file.replace(ROOT + '/', '')}: var(${name}, ${fallback.trim()})`)
        }
      }
    }
    expect([...new Set(frozen)]).toEqual([])
  })
})

describe('light mode is untouched', () => {
  // This lane ships dark mode only. Every semantic alias must resolve to exactly
  // the value it resolved to before — including the legacy --brand-* names, which
  // were repointed from raw scale tokens to semantic ones so they follow the
  // theme. That repoint is only safe if it is a value-for-value no-op in light.
  const LIGHT_BASELINE = {
    '--bg-page': '#FDFBF3',
    '--bg-page-alt': '#F8F3E8',
    '--surface-card': '#FFFFFF',
    '--surface-muted': '#F8F3E8',
    '--surface-sunken': '#F1EADB',
    '--surface-ink': '#14385A',
    '--surface-spark': '#FEF6EC',
    '--text-strong': '#14385A',
    '--text-body': '#211D17',
    '--text-muted': '#6B6353',
    '--text-subtle': '#756D5C',
    '--text-on-dark': '#FFFEF9',
    '--text-on-accent': '#FFFFFF',
    '--text-link': '#2A6191',
    '--accent': '#F0811E',
    '--accent-hover': '#E0710F',
    '--accent-press': '#C25E0C',
    '--accent-soft': '#FCEAD0',
    '--accent-text': '#9A4A0C',
    '--primary': '#14385A',
    '--primary-hover': '#0E2942',
    '--primary-soft': '#E0EBF4',
    '--border-default': '#E7DECB',
    '--border-strong': '#D6CFBE',
    '--border-accent': '#FBB85A',
    '--ring': '#F89A2E',
    '--ring-navy': '#6E97BD',
    '--status-success': '#2E9E6B',
    '--status-success-bg': '#E4F4EB',
    '--status-thin': '#D98A1F',
    '--status-thin-bg': '#FBEED6',
    '--status-error': '#D1503C',
    '--status-error-bg': '#FBE6E1',
    '--brand-orange': '#F0811E',
    '--brand-amber': '#D98A1F',
    '--brand-navy': '#14385A',
    '--brand-navy-light': '#2A6191',
    '--brand-cream': '#FDFBF3',
    '--brand-cream-dark': '#F1EADB',
  }

  it.each(Object.entries(LIGHT_BASELINE))('%s still resolves to %s', (token, expected) => {
    expect(resolve(token, LIGHT)).toBe(expected)
  })
})

describe('lib/coachColors.js mirrors globals.css', () => {
  it('every coach hex matches the stylesheet in both themes', async () => {
    const { COACH_COLORS_LIGHT, COACH_COLORS_DARK } = await import('./coachColors.js')
    for (const [theme, table, vars] of [
      ['light', COACH_COLORS_LIGHT, LIGHT],
      ['dark', COACH_COLORS_DARK, DARK],
    ]) {
      for (const key of COACHES) {
        expect(table[key].base.toUpperCase(), `${key}.base (${theme})`)
          .toBe(color(`--tutor-${key}`, vars, theme).toUpperCase())
        expect(table[key].tint.toUpperCase(), `${key}.tint (${theme})`)
          .toBe(color(`--tutor-${key}-tint`, vars, theme).toUpperCase())
        expect(table[key].shade.toUpperCase(), `${key}.shade (${theme})`)
          .toBe(color(`--tutor-${key}-shade`, vars, theme).toUpperCase())
      }
    }
  })

  it('getCoachColor keeps its shape and returns theme-following var() refs', async () => {
    const { getCoachColor } = await import('./coachColors.js')
    const c = getCoachColor('tilly')
    expect(Object.keys(c).sort()).toEqual(['base', 'name', 'shade', 'tint'])
    expect(c.base).toBe('var(--tutor-tilly)')
    expect(getCoachColor('nope-not-a-coach')).toEqual(getCoachColor('owen'))
  })
})
