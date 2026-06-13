'use client'

import { useEffect, useRef, useState } from 'react'

export default function Navbar({ user, profile }) {
  const [open, setOpen] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const dropdownRef = useRef(null)

  const isAdmin = profile?.role === 'admin'
  const homeHref = profile?.role === 'teacher' ? '/teacher'
    : profile?.role === 'parent' ? '/parent'
    : '/dashboard'
  const avatarUrl = profile?.avatar_url ?? user?.user_metadata?.avatar_url
  const name = profile?.full_name ?? user?.user_metadata?.full_name ?? user?.email ?? ''
  const email = user?.email ?? ''
  const initial = (name[0] ?? '?').toUpperCase()

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
          {avatarUrl && !avatarError ? (
            <img src={avatarUrl} alt="" width={36} height={36}
              className="rounded-full object-cover"
              style={{ border: '2px solid var(--border-default)' }}
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)} />
          ) : (
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
              {initial}
            </div>
          )}
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
              <a href="/profile"
                className="flex items-center px-4 py-2 text-sm transition"
                style={{ color: 'var(--text-body)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-muted)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => setOpen(false)}>
                Profile
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
