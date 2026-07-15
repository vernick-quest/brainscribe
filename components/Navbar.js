'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/Avatar'

// The breadcrumb word shown next to the logo — reflects the section of the site
// the current URL is in. Empty string → show just the logo.
function sectionLabel(pathname) {
  if (!pathname) return ''
  if (pathname.startsWith('/parent/settings')) return 'Account & children'
  if (pathname === '/parent' || pathname === '/teacher') return 'Dashboard'
  if (pathname === '/dashboard') return 'Assignments'
  if (pathname === '/profile') return 'Profile'
  if (pathname.startsWith('/gym')) return 'Skill Studio'
  if (pathname.startsWith('/admin')) return 'Admin'
  // Individual assignment/transcript pages already have their own in-page back
  // link (e.g. "← Assignments"), so no breadcrumb here — a "Assignment" crumb
  // next to an "Assignments" back arrow just reads as a confusing duplicate.
  return ''
}

export default function Navbar({ user, profile }) {
  const renderedUserId = user?.id ?? null
  const section = sectionLabel(usePathname())

  const isParent = profile?.role === 'parent'
  const homeHref = profile?.role === 'teacher' ? '/teacher'
    : profile?.role === 'parent' ? '/parent'
    : '/dashboard'
  // Clicking the avatar goes straight to the account page — where the user edits
  // their details and signs out. Parents get /parent/settings ("Account &
  // children"); everyone else gets /profile. (Replaces the old dropdown menu: one
  // click → the profile page, which now hosts sign-out and, for admins, the
  // Admin panel link.)
  const accountHref = isParent ? '/parent/settings' : '/profile'
  const accountLabel = isParent ? 'Account & children' : 'Your profile'
  // COPPA data-minimization: the avatar reads the minimized profiles.avatar_url
  // ONLY — never user.user_metadata.avatar_url (the raw Google photo migration 019
  // does not null). Avatar fail-closes on age_bracket, so an under-13/unknown-age
  // account renders initials, never a photo. (full_name is a display label, not a
  // photo, so its metadata fallback is fine.)
  const name = profile?.full_name ?? user?.user_metadata?.full_name ?? user?.email ?? ''

  // Cross-tab identity guard. A browser keeps ONE session cookie shared across
  // every tab, so signing into a different account (or out) in another tab
  // silently replaces this tab's session. When this tab regains focus, re-read
  // who the cookie now belongs to; if it changed since this page was rendered,
  // reload to show the real account — or bounce to /login if signed out — so a
  // stale tab can never display, or act under, the wrong identity. The cheap
  // cookie read (getSession) is fine here: this is a UX correctness check, and
  // the server re-validates the session on the reload.
  useEffect(() => {
    const supabase = createClient()

    async function check() {
      if (document.visibilityState !== 'visible') return
      const { data: { session } } = await supabase.auth.getSession()
      const currentId = session?.user?.id ?? null
      // Only react to a genuine switch to a DIFFERENT account. A transient null —
      // e.g. the client cookie lagging for a beat right after sign-in on mobile
      // (returning from Google OAuth) — must NOT bounce to /login, or it reads as
      // a failed sign-in. Real sign-outs are caught by the server/proxy on the
      // next navigation.
      if (currentId && currentId !== renderedUserId) window.location.reload()
    }

    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('pageshow', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('pageshow', check)
    }
  }, [renderedUserId])

  return (
    <header className="sticky top-0 z-20 px-6 py-3 flex items-center justify-between"
      style={{
        backgroundColor: 'var(--surface-card)',
        borderBottom: '1px solid var(--border-default)',
      }}>

      <div className="flex items-center gap-3">
        <a href={homeHref}>
          <img src="/brainscribe-logo.png" alt="BrainScribe" style={{ height: 32, width: 'auto' }} />
        </a>
        {/* Section breadcrumb — the word next to the logo names the section the
            current URL is in (Profile, Assignments, Skill Studio, …). */}
        {section && (
          <span className="hidden sm:flex items-center gap-3">
            <span aria-hidden="true" style={{ color: 'var(--border-strong)' }}>|</span>
            <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-muted)' }}>
              {section}
            </span>
          </span>
        )}
      </div>

      {/* Avatar links straight to the account page (profile / settings). */}
      <a
        href={accountHref}
        aria-label={accountLabel}
        className="rounded-full transition hover:opacity-90"
        style={{ padding: '4px', display: 'inline-flex' }}
      >
        <Avatar
          name={name}
          avatarUrl={profile?.avatar_url}
          // Own-avatar COPPA gate: only a `student` can be under-13, so adults
          // (admin/parent/teacher — inherently 13+) pass '13plus' to show their
          // photo; students keep the fail-closed real bracket so a child's photo
          // is never surfaced.
          ageBracket={profile?.role === 'student' ? profile?.age_bracket : '13plus'}
          size={36}
          style={{ border: '2px solid var(--border-default)' }}
        />
      </a>
    </header>
  )
}
