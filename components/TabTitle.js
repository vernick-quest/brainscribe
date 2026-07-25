'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Puts the signed-in person's FIRST NAME in the browser tab title — "BrainScribe
// — Elio" — so several accounts open at once are tellable apart. An admin's own
// session reads "BrainScribe — ADMIN"; while remoting in, the page already hands
// us the IMPERSONATED profile, so the tab names whoever you're looking at.
//
// First name only: enough to tell two tabs apart, and it keeps a full name — a
// child's in particular — out of browser history and session sync.
//
// AUTHED surfaces only (Navbar, plus the few dashboards that draw their own
// header). Public marketing pages keep the titles their metadata sets — those are
// SEO surface and must not be rewritten.

/** Client-component form: `useTabTitle(profile?.full_name, profile?.role)`. */
export function useTabTitle(name, role) {
  const pathname = usePathname()
  useEffect(() => {
    // Re-applies on route change: App Router writes the route's metadata title on
    // navigation, which would otherwise clobber ours.
    const first = String(name ?? '').trim().split(/\s+/)[0] || ''
    const who = role === 'admin' ? 'ADMIN' : first
    document.title = who ? `BrainScribe — ${who}` : 'BrainScribe'
  }, [name, role, pathname])
}

/** Server-page form: drop `<TabTitle name={…} role={…} />` in. Renders nothing. */
export default function TabTitle({ name, role }) {
  useTabTitle(name, role)
  return null
}
