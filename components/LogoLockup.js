// components/LogoLockup.js — the BrainScribe wordmark lockup, theme-aware.
//
// ONE component for all nine places the lockup appears, because the alternative is
// nine hand-written <picture> blocks in five different JSX formattings, and the
// next person to change the logo has to find all nine again.
//
// ── Why a <picture> and not CSS ──────────────────────────────────────────────
// The lockup is a raster with navy ink baked in. On the dark page background that
// measured 2.14:1 — present but effectively unreadable, and it appears on the
// marketing header, the signed-in navbar, login, welcome, both COPPA pages and
// both error pages. No CSS fixes an image, so the only real fix is a second file.
//
// <picture> is deliberate over a JS theme check: it resolves in the browser's own
// image selection, before paint and without hydration, so there is no flash of the
// wrong logo on a dark-mode first load. Server-rendered pages get it for free.
//
// The dark asset is the SAME artwork, not a redraw: the navy ink was remapped to
// --text-on-dark and the cream-filled counters in B/R/A were punched through to
// real transparency. A regenerated version lost those counters twice (the letters
// closed into solid blobs) — type is exactly what image models smooth away, so
// this asset must never be "recreated", only recoloured. See
// docs/specs/logo-lockup-dark-mode-instructions.md.
//
// Both files carry the same intrinsic size (900x192), so layout is identical in
// either theme and nothing shifts when the OS setting changes.

export const LOGO_LIGHT = '/brainscribe-logo.png'
export const LOGO_DARK = '/brainscribe-logo-dark.png'

export default function LogoLockup({ alt = 'BrainScribe', style, className, ...rest }) {
  return (
    <picture>
      <source srcSet={LOGO_DARK} media="(prefers-color-scheme: dark)" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_LIGHT} alt={alt} style={style} className={className} {...rest} />
    </picture>
  )
}
