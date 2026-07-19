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
const DISALLOW = [
  '/api/',
  '/write',
  '/folder',
  '/parent',
  '/teacher',
  '/profile',
  '/onboarding',
  '/coppa',
  '/transcript',
  '/invite',
  '/login',
]

// AI-assistant crawlers + training/grounding opt-in tokens. Explicitly ALLOWed
// so BrainScribe's public pages can be fetched and cited by ChatGPT/SearchGPT,
// Perplexity, Claude, Gemini/AI Overviews, Bing, and Apple Intelligence. A page
// that can't be fetched can't be cited. (Google-Extended / Applebot-Extended are
// opt-in tokens for AI use, not separate crawlers — listing them signals intent.)
const AI_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'PerplexityBot',
  'ClaudeBot',
  'anthropic-ai',
  'Google-Extended',
  'Bingbot',
  'Applebot-Extended',
]

export default function robots() {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      { userAgent: AI_BOTS, allow: '/', disallow: DISALLOW },
    ],
    sitemap: `${CANONICAL_URL}/sitemap.xml`,
    host: CANONICAL_URL,
  }
}
