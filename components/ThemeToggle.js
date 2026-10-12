'use client'

import { THEME_LABELS, nextTheme } from '@/lib/themePreference'
import useThemePreference from '@/components/useThemePreference'

// One button, three states: System → Light → Dark → System.
//
// The PAGE theme is never set from here on first load — the blocking script in
// <head> (THEME_INIT_SCRIPT) has already put `data-theme` on <html> before paint.
//
// This is one of TWO controls for the same setting (the other is the radio group on
// the account pages, ThemePreferenceControl). Both read and write ONLY through
// useThemePreference → lib/themePreference.js, and both re-render on every change,
// so flipping one moves the other. Never add a localStorage/data-theme path here.

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
  const { theme, choose } = useThemePreference()

  const label = `Theme: ${THEME_LABELS[theme]}`

  // The BUTTON is a 44px tap target (CLAUDE.md: 44px minimum — this is a control
  // for kids on tablets), while the visible box stays 32/36px to sit correctly
  // beside the nav links. The negative margin absorbs the extra, so adding the
  // toggle does not push its neighbours apart.
  const pad = Math.max(0, (TAP_MIN - size) / 2)

  return (
    <button
      type="button"
      onClick={() => choose(nextTheme(theme))}
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
