import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function updateSession(request) {
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
  const publicPaths = ['/login', '/invite', '/api/auth', '/privacy', '/terms', '/about', '/blog', '/coppa/consent']
  const isPublic = publicPaths.some(p => pathname.startsWith(p))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
