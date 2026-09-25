'use client'

import { useEffect, useState } from 'react'
import {
  THEME_STORAGE_KEY, THEME_LABELS, nextTheme, normalizeTheme, themeAttribute,
} from '@/lib/themePreference'

// One button, three states: System → Light → Dark → System.
//
// The PAGE theme is never set from here on first load — the blocking script in
// <head> (THEME_INIT_SCRIPT) has already put `data-theme` on <html> before paint.
// This component only reads the stored preference back so the icon matches, and
// writes the attribute on subsequent clicks.
//
// Which is why the initial state is 'system' on both server and client: rendering
// the real preference during hydration would need to read localStorage, which the
// server cannot do, and a mismatch there is a hydration error. The effect corrects
// the ICON a tick later. Nothing about the page's colours depends on that tick.

function Icon({ theme }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (theme === 'light') {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    )
  }
  if (theme === 'dark') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  }
  // System — a display, i.e. "whatever this device says".
  return (
    <svg {...common} aria-hidden="true">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

const TAP_MIN = 44

export default function ThemeToggle({ size = 36, className = '' }) {
  const [theme, setTheme] = useState('system')

  useEffect(() => {
    try {
      setTheme(normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)))
    } catch {
      /* localStorage can throw outright in private modes — stay on 'system'. */
    }
  }, [])

  function apply(next) {
    setTheme(next)
    const attr = themeAttribute(next)
    // null means REMOVE: on 'system' the media query must be the only thing
    // deciding, or the reader stays pinned to their last explicit choice.
    if (attr) document.documentElement.setAttribute('data-theme', attr)
    else document.documentElement.removeAttribute('data-theme')
    try {
      if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
      else localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      /* Preference won't persist across reloads, but this visit still works. */
    }
  }

  const label = `Theme: ${THEME_LABELS[theme]}`

  // The BUTTON is a 44px tap target (CLAUDE.md: 44px minimum — this is a control
  // for kids on tablets), while the visible box stays 32/36px to sit correctly
  // beside the nav links. The negative margin absorbs the extra, so adding the
  // toggle does not push its neighbours apart.
  const pad = Math.max(0, (TAP_MIN - size) / 2)

  return (
    <button
      type="button"
      onClick={() => apply(nextTheme(theme))}
      aria-label={`${label}. Switch to ${THEME_LABELS[nextTheme(theme)]}.`}
      title={label}
      className={`flex items-center justify-center ${className}`}
      style={{
        width: TAP_MIN, height: TAP_MIN, margin: -pad, padding: 0,
        flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        data-theme-toggle-box=""
        className="flex items-center justify-center rounded-lg transition"
        style={{
          width: size, height: size,
          border: '1px solid var(--border-default)',
          background: 'transparent',
          color: 'var(--text-muted)',
        }}
      >
        <Icon theme={theme} />
      </span>
    </button>
  )
}
