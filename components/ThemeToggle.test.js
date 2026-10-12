import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ThemeToggle from './ThemeToggle'

// The cycling and persistence logic lives in lib/themePreference.js and is tested
// there against every corrupt value. What is worth holding HERE is the markup
// contract: this is a control a student has to be able to find and operate, and it
// renders on the server first, where there is no localStorage and no theme.
describe('ThemeToggle', () => {
  const html = renderToStaticMarkup(<ThemeToggle />)

  it('renders a real button, not a div with a click handler', () => {
    expect(html).toMatch(/<button[^>]*type="button"/)
  })

  it('names both the current state and what pressing it does', () => {
    // An icon-only control is unusable without this — "Theme" alone would not say
    // which theme is on, and screen-reader users get no visual cue at all.
    expect(html).toMatch(/aria-label="Theme: System\. Switch to Light\."/)
  })

  it('renders the SYSTEM state on the server, where no preference is readable', () => {
    // The server cannot read localStorage. Rendering anything else here would be a
    // hydration mismatch; the page colours are already correct from the <head>
    // script, so only this icon settles a tick later.
    expect(html).toContain('Theme: System')
  })

  it('hides the icon from assistive tech, since the label already says it', () => {
    expect(html).toContain('aria-hidden="true"')
  })

  it('styles through theme tokens, so the control itself follows the theme', () => {
    expect(html).toMatch(/var\(--border-default\)/)
    expect(html).toMatch(/var\(--text-muted\)/)
  })
})
