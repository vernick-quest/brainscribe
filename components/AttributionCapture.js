'use client'

import { useEffect } from 'react'

// First-touch marketing attribution. When a visitor arrives from a campaign link
// (?utm_source=facebook&utm_campaign=…), stash the UTM params in a first-party
// cookie so the source survives the Google OAuth round-trip — by the time they
// finish signing in, the original querystring is long gone, so forwarding it on
// the CTA link alone wouldn't reach the signup. First-touch wins: we never
// overwrite an existing value, so the first campaign that brought them keeps the
// credit. A later signup hook can read `bs_attribution` to record which channel
// converted (the marketing plan's whole measurement model).
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

export default function AttributionCapture() {
  useEffect(() => {
    if (document.cookie.includes('bs_attribution=')) return
    const params = new URLSearchParams(window.location.search)
    const data = {}
    for (const k of UTM_KEYS) {
      const v = params.get(k)
      if (v) data[k] = v.slice(0, 120)
    }
    if (Object.keys(data).length === 0) return
    const value = encodeURIComponent(JSON.stringify(data))
    // 30-day first-touch window; Lax so it's still sent on the top-level redirect
    // back from Google after OAuth.
    document.cookie = `bs_attribution=${value}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`
  }, [])

  return null
}
