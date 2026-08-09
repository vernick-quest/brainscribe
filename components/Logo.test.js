// components/Logo.test.js
//
// Logo has no consumers today, which is exactly why it needs a test: a dead
// component is invisible to `next build`, to review, and to every screenshot —
// so the day someone wires it up is the day a hardcoded navy base goes onto a
// navy page and nobody notices until a user squints at it. The trap is that it
// looks CORRECT in light mode, forever.
//
// This renders the real component rather than grepping the file, so the SVG has
// to actually be valid JSX that produces the markup asserted below.
//
// The contrast half of the invariant is NOT duplicated here: lib/theme.test.js
// already gates --text-strong against --bg-page at 4.5:1 in both themes. All
// this file has to prove is that the mark reaches that token.

import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Logo from './Logo.js'

const html = renderToStaticMarkup(createElement(Logo))

/** Every <rect> in the rendered mark — the lightbulb base, which sits on the page. */
const rects = [...html.matchAll(/<rect\b[^>]*>/g)].map(m => m[0])

/** Every stroked <path> — the brain squiggles, which sit on the orange bulb. */
const strokedPaths = [...html.matchAll(/<path\b[^>]*stroke=[^>]*>/g)].map(m => m[0])

describe('Logo renders', () => {
  it('produces a single well-formed svg with the bulb gradient intact', () => {
    expect(html.startsWith('<svg')).toBe(true)
    expect(html).toContain('url(#bulbGrad)')
    // A gradient reference with no matching <linearGradient> paints nothing.
    expect(html).toMatch(/<linearGradient[^>]*id="bulbGrad"/)
  })

  it('has the three base rects and the three squiggle paths', () => {
    // Guards the assertions below against silently passing over an empty set if
    // the mark is ever restructured.
    expect(rects).toHaveLength(3)
    expect(strokedPaths).toHaveLength(3)
  })
})

describe('the base follows the theme', () => {
  it('paints every base rect with --text-strong', () => {
    for (const rect of rects) {
      expect(rect, 'base rect must follow the theme token').toContain('fill="var(--text-strong)"')
    }
  })

  it('freezes no color literal anywhere on the base', () => {
    // The specific failure this file exists to prevent: #1E2D5A on the page
    // background. Checked as "any literal", not "not that one hex", so a
    // different hardcoded navy cannot slip in later.
    for (const rect of rects) {
      expect(rect, `base rect has a hardcoded fill: ${rect}`)
        .not.toMatch(/fill="(#|rgb|hsl|black|white)/i)
    }
  })
})

describe('the brain squiggles stay hardcoded on purpose', () => {
  it('keeps navy strokes, because they sit on the orange bulb, not the page', () => {
    // Deliberately asserted rather than left unstated: the bulb is the same
    // orange in both themes, so theming these would make them VANISH at night.
    // If someone "fixes" them to --text-strong, this fails and explains why.
    for (const path of strokedPaths) {
      expect(path, 'squiggle stroke must stay a fixed navy on the orange bulb')
        .toContain('stroke="#1E2D5A"')
    }
  })
})
