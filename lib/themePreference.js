// lib/themePreference.js — the light/dark/system preference, as pure logic.
//
// Dark mode itself is CSS: `app/globals.css` redefines the semantic tokens under
// `@media (prefers-color-scheme: dark)` for the automatic case and under
// `:root[data-theme="dark"]` for a manual one. Nothing here paints anything — this
// only decides which of the three states is stored and what attribute, if any,
// belongs on <html>.
//
// Three states, per the design package: 'system' | 'light' | 'dark'.
// 'system' is the ABSENCE of the attribute, not a third value written onto it —
// that is what keeps the OS-driven path working with scripting turned off.

export const THEME_STORAGE_KEY = 'bs-theme'

/** The cycle order of the header button. */
export const THEME_ORDER = ['system', 'light', 'dark']

export const THEME_LABELS = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

/**
 * Anything read back out of localStorage is untrusted — another tab, an older
 * build, or a person typing in the console can put arbitrary text there. Fall
 * back to following the device rather than throwing or picking a theme.
 */
export function normalizeTheme(value) {
  return THEME_ORDER.includes(value) ? value : 'system'
}

/** System → Light → Dark → System. */
export function nextTheme(current) {
  const i = THEME_ORDER.indexOf(normalizeTheme(current))
  return THEME_ORDER[(i + 1) % THEME_ORDER.length]
}

/**
 * What `data-theme` should be for a preference. `null` means REMOVE the
 * attribute: on 'system' the media query has to be the only thing deciding, so
 * leaving a stale attribute behind would pin the reader to whatever they last
 * chose and the OS switch would stop working.
 */
export function themeAttribute(preference) {
  const pref = normalizeTheme(preference)
  return pref === 'system' ? null : pref
}

/** Which theme actually paints, given the preference and the device setting. */
export function resolveTheme(preference, prefersDark) {
  const pref = normalizeTheme(preference)
  if (pref === 'system') return prefersDark ? 'dark' : 'light'
  return pref
}

/**
 * Runs BLOCKING in <head>, before first paint, so a reader who chose Dark on a
 * light-OS machine never sees a flash of cream before hydration. It is inlined as
 * a string because it has to execute before React exists.
 *
 * Deliberately minimal: only ever SETS the attribute, never clears one, and only
 * for the two explicit values. Wrapped in try/catch because localStorage throws
 * outright in some privacy modes — and a throw here, in <head>, would take the
 * whole page down for a preference.
 */
export const THEME_INIT_SCRIPT =
  `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`
