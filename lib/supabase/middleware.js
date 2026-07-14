import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function updateSession(request) {
  // Canonical-host redirect. The production deployment is ALSO reachable at the raw
  // brainscribe.vercel.app domain. If a user lands there (browser autocomplete is
  // sticky after testing on it), the whole OAuth flow runs on that host and strands
  // them off the real domain — and because the PKCE `code_verifier` cookie is written
  // per-domain, finishing the flow on a different host fails the code exchange outright.
  // Force browser (non-API) requests onto www.brainscribe.io up front so login happens
  // entirely on one canonical host. /api/* is excluded: a cross-origin 308 would strip
  // the Authorization header off the Vercel Cron bearer call.
  if (request.headers.get('host') === 'brainscribe.vercel.app'
      && !request.nextUrl.pathname.startsWith('/api')) {
    const dest = new URL(request.nextUrl.pathname + request.nextUrl.search, 'https://www.brainscribe.io')
    return NextResponse.redirect(dest, 308)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  console.log('[proxy] path:', pathname, '| user:', user?.email ?? 'none', '| error:', error?.message ?? 'none')
  console.log('[proxy] cookies:', request.cookies.getAll().map(c => c.name))

  // Public paths that don't require auth. Includes the legal/marketing pages
  // (also linked from the Google OAuth consent screen, so Google must reach them
  // logged-out) and the COPPA consent page, which a parent opens from an email
  // before they've signed in.
  // /welcome (age/role) is where a brand-new user lands straight from the OAuth
  // callback — before the just-set auth cookie is reliably readable by getUser(),
  // so gating it server-side hard-bounces first-time signups to /login on their
  // very first attempt (it settles by the retry). Keep it public; the client picks
  // up the session once it settles, and its actions still require a real session.
  // /api/cron/* is called by Vercel Cron with a CRON_SECRET bearer (no Supabase
  // session), so it must bypass the auth redirect — the route handler does its own
  // secret check. Without this the middleware 307s the cron to /login.
  const publicPaths = ['/login', '/invite', '/api/auth', '/api/cron', '/privacy', '/terms', '/about', '/blog', '/coppa/consent', '/welcome', '/faq', '/compare', '/writing-help']
  // The marketing landing page at `/` plus the SEO/crawler routes (sitemap,
  // robots, the default OG share image) must be reachable logged-out — search
  // engines and social-card scrapers fetch them with no session, and a 307 to
  // /login would leave the site uncrawlable and break link previews. Matched
  // exactly so they don't widen the prefix check. Per-post OG images at
  // /blog/<slug>/opengraph-image already pass via the '/blog' prefix above.
  const exactPublicPaths = ['/', '/sitemap.xml', '/robots.txt', '/opengraph-image', '/llms.txt']
  const isPublic = exactPublicPaths.includes(pathname) || publicPaths.some(p => pathname.startsWith(p))

  // Don't bounce a request that already carries a Supabase auth cookie even if
  // getUser() momentarily returns null — right after OAuth the session is still
  // settling, and a hard redirect to /login here is exactly the first-login bounce
  // users keep hitting. If the cookie is genuinely invalid, the destination page
  // re-checks auth and handles it (no loop — /login is public).
  const hasAuthCookie = request.cookies.getAll().some(
    c => c.name.includes('-auth-token') && !c.name.includes('code-verifier')
  )

  if (!user && !isPublic && !hasAuthCookie) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
