'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/Avatar'

export default function Navbar({ user, profile }) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const renderedUserId = user?.id ?? null

  const isAdmin = profile?.role === 'admin'
  const isParent = profile?.role === 'parent'
  const homeHref = profile?.role === 'teacher' ? '/teacher'
    : profile?.role === 'parent' ? '/parent'
    : '/dashboard'
  // Parents get a dedicated account home (/parent/settings) that supersedes the
  // bare /profile page; everyone else keeps /profile.
  const accountHref = isParent ? '/parent/settings' : '/profile'
  const accountLabel = isParent ? 'Settings' : 'Profile'
  // COPPA data-minimization: the avatar reads the minimized profiles.avatar_url
  // ONLY — never user.user_metadata.avatar_url (the raw Google photo migration 019
  // does not null). Avatar fail-closes on age_bracket, so an under-13/unknown-age
  // account renders initials, never a photo. (full_name is a display label, not a
  // photo, so its metadata fallback is fine.)
  const name = profile?.full_name ?? user?.user_metadata?.full_name ?? user?.email ?? ''
  const email = user?.email ?? ''

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

      <a href={homeHref}>
        <img src="/brainscribe-logo.png" alt="BrainScribe" style={{ height: 32, width: 'auto' }} />
      </a>

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 rounded-full transition"
          style={{ padding: '4px' }}
          aria-label="Account menu"
          aria-expanded={open}
        >
          <Avatar
            name={name}
            avatarUrl={profile?.avatar_url}
            ageBracket={profile?.age_bracket}
            size={36}
            style={{ border: '2px solid var(--border-default)' }}
          />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-56 py-1"
            style={{
              backgroundColor: 'var(--surface-card)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--border-default)',
              zIndex: 50,
            }}>

            {/* Identity header */}
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-strong)' }}>{name}</p>
              <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{email}</p>
            </div>

            {/* Links */}
            <div className="py-1">
              <a href={accountHref}
                className="flex items-center px-4 py-2 text-sm transition"
                style={{ color: 'var(--text-body)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-muted)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => setOpen(false)}>
                {accountLabel}
              </a>
              {isAdmin && (
                <a href="/admin"
                  className="flex items-center px-4 py-2 text-sm transition"
                  style={{ color: 'var(--text-body)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-muted)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  onClick={() => setOpen(false)}>
                  Admin ↗
                </a>
              )}
            </div>

            {/* Sign out — POST form (GET logout would be CSRF-able) */}
            <div style={{ borderTop: '1px solid var(--border-default)' }} className="py-1">
              <form action="/api/auth/signout" method="POST">
                <button type="submit"
                  className="w-full text-left flex items-center px-4 py-2 text-sm transition"
                  style={{ color: 'var(--status-error)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-muted)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                  Sign out
                </button>
              </form>
            </div>

          </div>
        )}
      </div>
    </header>
  )
}
