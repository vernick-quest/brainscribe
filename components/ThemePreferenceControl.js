'use client'

import { useId } from 'react'
import { THEME_ORDER, THEME_LABELS } from '@/lib/themePreference'
import useThemePreference from '@/components/useThemePreference'

// The theme choice as it appears on the account pages — "Preferences" on /profile,
// "Appearance" on /parent/settings. Same setting as the header button (ThemeToggle),
// shown as all three options at once because a settings page is where people go to
// SEE what is set, not to cycle through it.
//
// 🔴 There is ONE store. This control reads and writes only through
// useThemePreference → lib/themePreference.js, exactly like the header button, and
// both re-render on every change — so the two can never disagree, on this page, after
// a reload, or across tabs. lib/themePreference.test.js fails if either grows its own
// localStorage/data-theme path.
//
// Mount it ONLY on the viewer's own account page. The preference belongs to this
// browser, not to the profile on screen: on someone else's profile (a parent viewing
// a student, an admin remoting in) it would read as a setting of THEIRS.
//
// Native radios, visually hidden: arrow-key navigation, one tab stop, and the
// checked state announced for free. The focus ring is drawn on the visible tile by
// `.theme-choice:has(input:focus-visible)` in globals.css.

const HINTS = {
  system: 'Match this device',
  light: 'Always light',
  dark: 'Always dark',
}

export default function ThemePreferenceControl() {
  const { theme, choose, persisted } = useThemePreference()
  const name = `theme-${useId()}`
  const hintId = `${name}-hint`

  return (
    <fieldset className="space-y-3" aria-describedby={hintId}>
      <legend className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
        Theme
      </legend>
      <p id={hintId} className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Saved in this browser, not your account. The button at the top of every page changes the same setting.
      </p>

      <div className="grid grid-cols-3 gap-2" data-theme-preference-control="">
        {THEME_ORDER.map(option => {
          const checked = theme === option
          return (
            <label
              key={option}
              className="theme-choice flex flex-col items-center justify-center text-center rounded-xl cursor-pointer transition"
              style={{
                minHeight: 'var(--tap-min)',
                padding: '8px 6px',
                border: `1.5px solid ${checked ? 'var(--surface-ink)' : 'var(--border-strong)'}`,
                backgroundColor: checked ? 'var(--surface-ink)' : 'transparent',
                color: checked ? 'var(--text-on-dark)' : 'var(--text-body)',
              }}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={checked}
                onChange={() => choose(option)}
                className="sr-only"
              />
              <span className="text-sm font-semibold">{THEME_LABELS[option]}</span>
              <span className="text-[11px] leading-tight" style={{ opacity: 0.85 }}>
                {HINTS[option]}
              </span>
            </label>
          )
        })}
      </div>

      {/* Not a silent no-op: if the browser refuses to store it, say the choice
          only lasts until a reload instead of letting it quietly "not stick". */}
      {!persisted && (
        <p role="status" className="text-xs" style={{ color: 'var(--status-error)' }}>
          This browser is blocking saved settings, so the theme will reset when you reload.
        </p>
      )}
    </fieldset>
  )
}
