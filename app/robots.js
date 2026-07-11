import { CANONICAL_URL } from '@/lib/site'

// Generates /robots.txt. Allows the public marketing surfaces and disallows the
// authenticated app + API (no SEO value, and we don't want app routes or the
// thin /login page in the index). Points crawlers at the sitemap.
//
// This list is about *indexing intent* and is deliberately NOT the same as the
// auth allowlist in lib/supabase/middleware.js (which is about *access*): e.g.
// /login is publicly reachable (allowed there) but kept out of the index
// (disallowed here). When adding a new public marketing page, also add it to
// the sitemap in app/sitemap.js.
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/write',
        '/dashboard',
        '/parent',
        '/teacher',
        '/profile',
        '/onboarding',
        '/coppa',
        '/transcript',
        '/invite',
        '/login',
      ],
    },
    sitemap: `${CANONICAL_URL}/sitemap.xml`,
    host: CANONICAL_URL,
  }
}
