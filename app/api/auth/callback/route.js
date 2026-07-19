import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { attributionToCapture } from '@/lib/attribution'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Sanitize `next` to a local path only — a value like `//evil.com` or `/\evil.com`
  // would otherwise produce an off-site redirect (open-redirect phishing).
  const rawNext = searchParams.get('next') ?? '/folder'
  const next = (rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\')) ? rawNext : '/folder'

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
    // signup_attribution is folded into the existing select (no extra round-trip).
    // Until migration 033 is applied the column doesn't exist and this select
    // ERRORS — degrade to the legacy column set so login routing NEVER breaks on
    // deploy ordering (attribution capture is simply dead until 033 lands).
    let { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role, role_confirmed, age_bracket, signup_attribution')
      .eq('id', user.id)
      .single()
    if (profileErr?.code === '42703') {
      ;({ data: profile } = await supabase
        .from('profiles')
        .select('role, role_confirmed, age_bracket')
        .eq('id', user.id)
        .single())
    }

    // First-touch attribution capture (set-once, service-role, channel/UTM only —
    // lib/attribution.js is the whitelist privacy rail). Placed before every
    // routing branch below so admin/welcome/folder signups all capture it.
    // Service-role on purpose: profiles is deny-by-default for `authenticated`
    // (migration 020), so the column stays non-client-writable (anti-spoofing).
    const capture = attributionToCapture(profile, cookieStore.get('bs_attribution')?.value)
    if (capture) {
      const { error: captureErr } = await createServiceClient()
        .from('profiles')
        .update({ signup_attribution: capture })
        .eq('id', user.id)
        .is('signup_attribution', null) // belt-and-suspenders set-once
      if (captureErr) {
        console.error('[auth callback] attribution capture failed:', captureErr.message)
      } else {
        // First touch is recorded — the cookie has done its job. Clear it on the
        // single shared response object (same rule as the session cookies above).
        response.cookies.set('bs_attribution', '', { path: '/', maxAge: 0 })
      }
    }

    // Persist the Google avatar — but NEVER for an under-13 account (COPPA
    // data-minimization). Migration 019 nulls existing under-13 avatars; this
    // stops a fresh photo from re-accumulating on every login. avatar_url stays
    // client-writable (not revoked by 020), so the user-scoped client is fine here.
    // Google puts the photo in different places depending on the account/flow:
    // user_metadata.avatar_url|picture, or the raw provider payload in
    // identities[].identity_data. Read all of them so a photo isn't missed just
    // because it landed in identity_data instead of user_metadata.
    const googleIdentity = user.identities?.find(i => i.provider === 'google')?.identity_data
    const avatarUrl = user.user_metadata?.avatar_url
      ?? user.user_metadata?.picture
      ?? googleIdentity?.avatar_url
      ?? googleIdentity?.picture
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
    // /folder, which can bounce a still-settling session straight to /login.
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
