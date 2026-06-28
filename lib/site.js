// Canonical production origin for SEO output (sitemap, robots, canonical URLs,
// Open Graph). `proxy.js` 308-redirects the apex and *.vercel.app hosts to this
// www host, so every SEO URL must point HERE — at the redirect target, never a
// URL that itself redirects (a canonical that 308s wastes crawl budget and
// muddies which URL ranks). This is deliberately a hardcoded constant, not the
// `NEXT_PUBLIC_SITE_URL` env var (which the COPPA email links default to the
// apex host) — SEO must stay pinned to the canonical host.
export const SITE_URL = 'https://www.brainscribe.io'
