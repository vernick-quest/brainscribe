import { SITE_URL } from '@/lib/site'

// Generates /robots.txt. Allows the public marketing surfaces and disallows the
// authenticated app + API (no SEO value, and we don't want app routes or the
// thin /login page in the index). Points crawlers at the sitemap.
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
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
