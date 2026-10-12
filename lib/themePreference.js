// lib/themePreference.js — the light/dark/system preference, as pure logic.
//
// Dark mode itself is CSS: `app/globals.css` redefines the semantic tokens under
// `@media (prefers-color-scheme: dark)` for the automatic case and under
// `:root[data-theme="dark"]` for a manual one. This module decides which of the
// three states is stored and what attribute, if any, belongs on <html> — and, at the
// bottom, is the ONLY code that writes either (see "The ONE store"). DOM and storage
// are passed in rather than reached for, so the whole thing tests without a browser.
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

// ── The ONE store, and the one place it is read and written ───────────────────────
//
// There are two controls for this one setting: the header button (ThemeToggle) and
// the Preferences/Appearance radio group on the account pages (ThemePreferenceControl).
// They must never disagree, so neither touches localStorage or `data-theme` itself —
// both go through the three functions below, via components/useThemePreference.js.
// lib/themePreference.test.js fails the suite if a component grows its own path.
//
// Where the CURRENT preference is read from: the `data-theme` attribute on <html>,
// not localStorage. On load THEME_INIT_SCRIPT copies storage into the attribute, so
// the two agree; but in a privacy mode where localStorage throws, the choice made on
// THIS visit only exists on the attribute. Reading storage there would make a control
// that mounts later say "System" over a page that is visibly dark — two controls
// disagreeing, which is exactly the failure this module exists to prevent.

/** Fired on `window` after every change, so every mounted control re-reads. */
export const THEME_CHANGE_EVENT = 'bs-theme-change'

/**
 * `window.localStorage` is a getter that can THROW (SecurityError when site data is
 * blocked), not just return null. Resolve it once, safely; null means "no storage".
 */
export function safeStorage(win) {
  try {
    return win?.localStorage ?? null
  } catch {
    return null
  }
}

/** The preference currently in force on this page, from the attribute on <html>. */
export function currentThemePreference(root) {
  try {
    return normalizeTheme(root?.getAttribute?.('data-theme') ?? null)
  } catch {
    return 'system'
  }
}

/** Put a preference onto <html>. 'system' REMOVES the attribute (see themeAttribute). */
export function applyThemeToDocument(preference, root) {
  const attr = themeAttribute(preference)
  if (!root) return
  if (attr) root.setAttribute('data-theme', attr)
  else root.removeAttribute('data-theme')
}

/**
 * The single write path. Paints, persists, then tells every mounted control.
 *
 * Returns `{ theme, persisted }`. `persisted: false` means the page changed but the
 * choice will NOT survive a reload (storage missing or throwing). That is reported,
 * not swallowed — a silent no-op is how a setting "doesn't stick" with no clue why.
 */
export function setThemePreference(preference, { root, storage, target } = {}) {
  const theme = normalizeTheme(preference)
  applyThemeToDocument(theme, root)

  let persisted = false
  if (storage) {
    try {
      // 'system' is the ABSENCE of a stored value, mirroring the attribute.
      if (theme === 'system') storage.removeItem(THEME_STORAGE_KEY)
      else storage.setItem(THEME_STORAGE_KEY, theme)
      persisted = true
    } catch {
      persisted = false
    }
  }

  // Dispatched AFTER the attribute is set: listeners re-read the attribute, so it
  // has to already hold the new value when they run.
  try {
    target?.dispatchEvent?.(new Event(THEME_CHANGE_EVENT))
  } catch {
    /* No event support — the caller's own state is still correct. */
  }
  return { theme, persisted }
}

/**
 * Follow every change, from any source:
 *   - THEME_CHANGE_EVENT — the other control on this page (or this one).
 *   - `storage` — a change made in ANOTHER TAB. That tab has already repainted
 *     itself; this one must too, or its controls would show the new value over a
 *     page still painted in the old one. `key === null` is localStorage.clear(),
 *     which removes the preference, i.e. back to System.
 *
 * Returns an unsubscribe function.
 */
export function subscribeThemePreference(onChange, { root, target } = {}) {
  if (!target?.addEventListener) return () => {}

  const onLocal = () => onChange(currentThemePreference(root))
  const onStorage = e => {
    if (e?.key !== THEME_STORAGE_KEY && e?.key !== null) return
    const theme = normalizeTheme(e.key === null ? null : e.newValue)
    applyThemeToDocument(theme, root)
    onChange(theme)
  }

  target.addEventListener(THEME_CHANGE_EVENT, onLocal)
  target.addEventListener('storage', onStorage)
  return () => {
    target.removeEventListener(THEME_CHANGE_EVENT, onLocal)
    target.removeEventListener('storage', onStorage)
  }
}
