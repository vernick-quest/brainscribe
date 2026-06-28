import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Shared 1200×630 Open Graph / Twitter card, rendered at build time via
// next/og. Brand palette is hardcoded (ImageResponse/satori can't read CSS
// vars) and mirrors app/globals.css. The navy wordmark PNG is embedded as a
// base64 data URL — satori can't resolve the woff2 build artifacts, so the
// title renders in next/og's default sans (acceptable, the brand mark carries
// the identity). Reading the PNG keeps this on the nodejs runtime (the default).
export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

const COLOR = {
  cream: '#FDFBF3',
  navy: '#14385A',
  orange: '#F0811E',
  accentText: '#9A4A0C',
  muted: '#6B6353',
}

export async function renderOgCard({ eyebrow = '', title, footer = 'brainscribe.io' }) {
  const wordmark = await readFile(join(process.cwd(), 'public', 'brainscribe-wordmark.png'))
  const wordmarkSrc = `data:image/png;base64,${wordmark.toString('base64')}`

  return new ImageResponse(
    (
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', backgroundColor: COLOR.cream }}>
        {/* orange accent band — accent reserved for the brand spark */}
        <div style={{ display: 'flex', height: 14, backgroundColor: COLOR.orange }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexGrow: 1, padding: '64px 80px' }}>
          <div style={{ display: 'flex' }}>
            <img src={wordmarkSrc} width={208} height={67} alt="" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {eyebrow ? (
              <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: COLOR.accentText, marginBottom: 22 }}>
                {eyebrow}
              </div>
            ) : null}
            <div style={{ display: 'flex', fontSize: 62, fontWeight: 700, lineHeight: 1.12, letterSpacing: -1, color: COLOR.navy, maxWidth: 1000 }}>
              {title}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: COLOR.muted }}>
            <div style={{ display: 'flex', width: 48, height: 5, backgroundColor: COLOR.orange, marginRight: 18, borderRadius: 3 }} />
            {footer}
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  )
}
