'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/Avatar'

// The breadcrumb word shown next to the logo — reflects the section of the site
// the current URL is in. Empty string → show just the logo.
function sectionLabel(pathname) {
  if (!pathname) return ''
  if (pathname.startsWith('/parent/settings')) return 'Account & children'
  // Home = the "Folder" — the container for all assignments. Student /folder plus
  // the parent/teacher home dashboards (their folder of their kids' work).
  if (pathname === '/folder' || pathname === '/parent' || pathname === '/teacher') return 'Folder'
  if (pathname.startsWith('/profile')) return 'Profile'
  if (pathname.startsWith('/admin')) return 'Admin'
  if (pathname.startsWith('/skill-studio')) return 'Skill Studio'
  if (pathname.startsWith('/assignment')) return 'Assignment'
  if (pathname.startsWith('/transcript')) return 'Transcript'
  return ''
}

export default function Navbar({ user, profile }) {
  const renderedUserId = user?.id ?? null
  const section = sectionLabel(usePathname())
  const [menuOpen, setMenuOpen] = useState(false)

  const isParent = profile?.role === 'parent'
  const homeHref = profile?.role === 'teacher' ? '/teacher'
    : profile?.role === 'parent' ? '/parent'
    : '/folder'
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
        {/* Hamburger menu — primary nav: Folder / Skill Studio / Profile.
            Links are role-aware (Folder + Profile resolve to the right home/account
            for students vs parents/teachers). */}
        <div className="relative">
          <button onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu" aria-haspopup="menu" aria-expanded={menuOpen}
            className="flex items-center justify-center rounded-lg transition"
            style={{ width: 36, height: 36, border: '1px solid var(--border-default)', background: menuOpen ? 'var(--surface-muted)' : 'transparent', color: 'var(--text-muted)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
              <div className="absolute left-0 mt-2"
                style={{ zIndex: 40, width: 200, background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', padding: 6 }}>
                {[['Folder', homeHref], ['Skill Studio', '/skill-studio'], ['Profile', accountHref]].map(([label, href]) => (
                  <a key={href} href={href} onClick={() => setMenuOpen(false)}
                    className="block rounded-md transition"
                    style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-body)', padding: '9px 12px', textDecoration: 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {label}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>

        <a href={homeHref}>
          <img src="/brainscribe-logo.png" alt="BrainScribe" style={{ height: 32, width: 'auto' }} />
        </a>
        {/* Section breadcrumb — the word next to the logo names the section the
            current URL is in (Folder, Assignment, Profile, …). */}
        {section && (
          <span className="hidden sm:flex items-center gap-3">
            <span aria-hidden="true" style={{ color: 'var(--border-strong)' }}>|</span>
            <span style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-muted)' }}>
              {section}
            </span>
          </span>
        )}
      </div>

      {/* Name + avatar → the account page (profile / settings). */}
      <a
        href={accountHref}
        aria-label={accountLabel}
        className="flex items-center gap-2.5 rounded-full transition hover:opacity-90"
        style={{ padding: '4px 4px 4px 12px' }}
      >
        {name && (
          <span className="hidden sm:inline"
            style={{ font: 'var(--type-ui)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-strong)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
        )}
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
