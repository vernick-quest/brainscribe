// components/CoachThinking.test.js — "Owen is thinking…" (2026-10-12).
//
// Renders the real component. What it has to prove: the coach's own name (Tilly, not
// "matilda"), colours that come from tokens only (so dark mode follows the theme), the
// visible copy hidden from assistive tech (LiveCaption's persistent status region carries
// the announcement — see TutorSession), and a reduced-motion rule that actually targets
// the dots. Timing/visuals in a real browser are covered by TESTING.md, not here.

import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import CoachThinking, { thinkingLabel, CoachTurnFailed } from './CoachThinking.js'
import { PERSONAS } from '@/lib/personas'

const render = (persona) => renderToStaticMarkup(createElement(CoachThinking, { persona }))

describe('CoachThinking', () => {
  it.each(Object.keys(PERSONAS))('names the coach by display name (%s)', (key) => {
    const html = render(key)
    expect(html).toContain(`${PERSONAS[key].name} is thinking…`)
    expect(thinkingLabel(key)).toBe(`${PERSONAS[key].name} is thinking…`)
  })

  it('says "Tilly", never the internal key "matilda"', () => {
    expect(render('matilda')).not.toMatch(/matilda is/i)
  })

  it('is aria-hidden (the announcement lives in a persistent live region, not here)', () => {
    expect(render("owen")).toMatch(/^(<link[^>]*>)*<div[^>]*aria-hidden="true"/)
  })

  it('uses tokens only — no raw colours in its inline styles', () => {
    const styles = [...render('zoe').matchAll(/style="([^"]*)"/g)].map(m => m[1])
      // PersonaAvatar's ring is from lib/coachColors — not this component's concern.
      .filter(st => !st.includes('border-radius:50%'))
    expect(styles.length).toBeGreaterThan(0)
    for (const st of styles) {
      expect(st).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
      for (const [, val] of st.matchAll(/color:([^;]+)/g)) expect(val.trim()).toMatch(/^var\(--/)
    }
  })

  it('has its dots in the coach colour token and a reduced-motion rule that stops them', () => {
    expect(render('owen')).toContain('color:var(--tutor-muse)')
    const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*{\s*\.coach-thinking-dots > span\s*{\s*animation:\s*none/)
  })
})

describe('CoachTurnFailed (a timed-out / failed turn)', () => {
  const html = renderToStaticMarkup(createElement(CoachTurnFailed, { persona: 'owen', message: 'That took too long — tap to try again.', onRetry: () => {} }))
  it('shows the gentle message and a real "Try again" button with a 44px target', () => {
    expect(html).toContain('That took too long — tap to try again.')
    expect(html).toMatch(/<button type="button"[^>]*style="[^"]*min-height:44px[^"]*"[^>]*>Try again<\/button>/)
  })
  it('copy is aria-hidden (the persistent status region announces it), the button is not', () => {
    expect(html).toMatch(/<span aria-hidden="true">That took too long/)
    expect(html).not.toMatch(/<button[^>]*aria-hidden/)
  })
  it('uses tokens only', () => {
    const styles = [...html.matchAll(/style="([^"]*)"/g)].map(m => m[1]).filter(st => !st.includes('border-radius:50%'))
    for (const st of styles) expect(st).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
  })
})
