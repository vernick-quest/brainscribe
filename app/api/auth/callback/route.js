import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Sanitize `next` to a local path only — a value like `//evil.com` or `/\evil.com`
  // would otherwise produce an off-site redirect (open-redirect phishing).
  const rawNext = searchParams.get('next') ?? '/dashboard'
  const next = (rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\')) ? rawNext : '/dashboard'

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
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, role_confirmed, age_bracket')
      .eq('id', user.id)
      .single()

    // Persist the Google avatar — but NEVER for an under-13 account (COPPA
    // data-minimization). Migration 019 nulls existing under-13 avatars; this
    // stops a fresh photo from re-accumulating on every login. avatar_url stays
    // client-writable (not revoked by 020), so the user-scoped client is fine here.
    const avatarUrl = user.user_metadata?.avatar_url
    if (avatarUrl && profile?.age_bracket !== 'under13') {
      await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id)
    }

    console.log('[auth callback]', user.email, '| profile:', profile ? `role=${profile.role} confirmed=${profile.role_confirmed}` : 'MISSING (trigger lag)')

    // Admins always go straight to /admin — never through /welcome
    if (profile?.role === 'admin') {
      response.headers.set('location', `${origin}/admin`)
      return response
    }

    // New or not-yet-confirmed users — INCLUDING a profile the DB trigger hasn't
    // created yet — go to /welcome (a public path). Never fall through to the gated
    // /dashboard, which can bounce a still-settling session straight to /login.
    if (!profile || !profile.role_confirmed) {
      response.headers.set('location', `${origin}/welcome?next=${encodeURIComponent(next)}`)
      return response
    }

    // Route confirmed users to their role's home dashboard
    const roleDashboard = { parent: '/parent', teacher: '/teacher' }
    if (roleDashboard[profile.role]) {
      response.headers.set('location', `${origin}${roleDashboard[profile.role]}`)
      return response
    }
  }

  return response
}
