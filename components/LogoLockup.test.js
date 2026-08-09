import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'
import LogoLockup from './LogoLockup'

// The lockup is a raster with navy ink baked in, so dark mode needs a SECOND FILE —
// no CSS can recolour an image. On the dark page background the light asset measured
// ~2:1, on nine surfaces including the marketing header, the signed-in navbar, login,
// welcome, both COPPA pages and both error pages.
//
// These hold the two ways that silently breaks: the dark source disappearing from the
// markup, and the dark FILE disappearing from disk. The second is the nastier one —
// a <source> pointing at a missing asset renders nothing at all in dark mode, which is
// strictly worse than the dim logo it replaced. That is why the wiring waited for the
// file to exist.
describe('LogoLockup', () => {
  const html = renderToStaticMarkup(<LogoLockup style={{ height: 32 }} />)

  it('offers the dark asset to a dark-scheme browser', () => {
    expect(html).toContain('media="(prefers-color-scheme: dark)"')
    expect(html).toContain('/brainscribe-logo-dark.png')
  })

  it('falls back to the light asset in the <img>, so any browser still shows a logo', () => {
    expect(html).toMatch(/<img[^>]+src="\/brainscribe-logo\.png"/)
  })

  it('keeps the alt text — the logo is the site name for a screen reader', () => {
    expect(html).toContain('alt="BrainScribe"')
  })

  it('passes styling through, so the nine call sites keep their own sizing', () => {
    expect(html).toMatch(/style="height:\s*32px"/)
  })

  // A <source> whose file does not exist renders NOTHING in dark mode.
  it('both asset files actually exist on disk', () => {
    const pub = path.join(process.cwd(), 'public')
    for (const f of ['brainscribe-logo.png', 'brainscribe-logo-dark.png']) {
      expect(fs.existsSync(path.join(pub, f)), `public/${f} is missing`).toBe(true)
    }
  })

  // Guard the thing two generated redraws got wrong: the counters in B/R/A were filled
  // solid rather than transparent, so the letters closed into blobs. The dark asset must
  // carry REAL transparency — a PNG can have an alpha channel and 0% transparent pixels,
  // which is exactly how the coach portraits shipped.
  it('the dark asset has real transparency, not just an alpha channel', async () => {
    const sharp = (await import('sharp')).default
    const file = path.join(process.cwd(), 'public', 'brainscribe-logo-dark.png')
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let clear = 0
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] < 20) clear++
    const pct = (100 * clear) / (info.width * info.height)
    expect(pct).toBeGreaterThan(50)
  })
})
