// Canonical production origin for SEO output (sitemap, robots, canonical URLs,
// Open Graph). `proxy.js` 308-redirects the apex and *.vercel.app hosts to this
// www host, so every SEO URL must point HERE — at the redirect target, never a
// URL that itself redirects (a canonical that 308s wastes crawl budget and
// muddies which URL ranks). Named CANONICAL_URL (not SITE_URL) on purpose: it is
// the www host and must not be confused with the apex-host `SITE_URL` constants
// inlined in the COPPA email paths (process.env.NEXT_PUBLIC_SITE_URL ??
// 'https://brainscribe.io'), which serve a different purpose.
export const CANONICAL_URL = 'https://www.brainscribe.io'
