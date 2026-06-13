import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const cookieStore = await cookies()

  // We use a single response object so that cookies written by
  // exchangeCodeForSession are always present, regardless of which
  // destination we ultimately redirect to.
  const response = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('Auth callback error:', error)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  // If this is an invite flow, let the invite page handle role assignment
  if (next.startsWith('/invite')) return response

  // If this is a COPPA consent completion, skip the role check
  // (the parent may not have a role_confirmed profile yet)
  if (next.startsWith('/coppa/')) return response

  // Use the user from the session directly — avoids stale cookie reads after exchange
  const user = session?.user
  if (user) {
    const avatarUrl = user.user_metadata?.avatar_url
    if (avatarUrl) {
      await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, role_confirmed')
      .eq('id', user.id)
      .single()

    // Admins always go straight to /admin — never through /welcome
    if (profile?.role === 'admin') {
      response.headers.set('location', `${origin}/admin`)
      return response
    }

    if (profile && !profile.role_confirmed) {
      // Mutate the redirect destination — cookies stay on the same response
      response.headers.set('location', `${origin}/welcome?next=${encodeURIComponent(next)}`)
      return response
    }

    // Route confirmed users to their role's home dashboard
    const roleDashboard = { parent: '/parent', teacher: '/teacher' }
    if (profile?.role && roleDashboard[profile.role]) {
      response.headers.set('location', `${origin}${roleDashboard[profile.role]}`)
      return response
    }
  }

  return response
}
