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
// ⚠️ Disallow entries are PREFIX matches, not exact paths. `/write` therefore also
// blocked `/writing-help` and every topic page under it — the SEO landing pages that
// are IN the sitemap. Search Console reported the contradiction ("Blocked by
// robots.txt", 2026-07-26). `$` anchors the match to the end of the path, so `/write$`
// blocks only the legacy /write alias. Before adding an entry here, check it isn't a
// prefix of a public page you want indexed.
const DISALLOW = [
  '/api/',
  '/write$',        // legacy alias → /assignment/new. NOT /writing-help/*
  '/assignment',
  '/skill-studio',
  '/gym',           // legacy alias → /skill-studio
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

// Deliberately NOT listed: /admin. It's auth+role gated and redirects before any
// content renders, so it can never be indexed anyway — and robots.txt is public, so
// naming it would advertise the route for zero indexing benefit.

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
