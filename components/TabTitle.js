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
  const pathname = usePathname()   // re-runs this on every client-side navigation

  useEffect(() => {
    const first = String(name ?? '').trim().split(/\s+/)[0] || ''
    const who = role === 'admin' ? 'ADMIN' : first
    const desired = who ? `BrainScribe — ${who}` : 'BrainScribe'

    // Setting document.title once is NOT enough. The App Router owns <title> through
    // the route's metadata, and React re-applies it after hydration and on every
    // navigation commit — landing AFTER this effect and silently resetting the tab to
    // a bare "BrainScribe". (That's the bug: the title was set correctly, then
    // overwritten a beat later.) So assert it, then watch <head> and re-assert if
    // anything replaces or edits the title. The equality guard makes our own write a
    // no-op, so the observer can't loop.
    const apply = () => { if (document.title !== desired) document.title = desired }
    apply()

    if (typeof MutationObserver !== 'function' || !document.head) return
    const observer = new MutationObserver(apply)
    // childList+subtree catches a wholesale <title> swap; characterData catches an
    // in-place text edit.
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [name, role, pathname])
}

/** Server-page form: drop `<TabTitle name={…} role={…} />` in. Renders nothing. */
export default function TabTitle({ name, role }) {
  useTabTitle(name, role)
  return null
}
