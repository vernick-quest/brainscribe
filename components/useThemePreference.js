'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import {
  currentThemePreference, safeStorage, setThemePreference, subscribeThemePreference,
} from '@/lib/themePreference'

// The one hook both theme controls use — the header button (ThemeToggle) and the
// account-page radio group (ThemePreferenceControl). Every read and write goes through
// lib/themePreference.js; nothing here touches localStorage or `data-theme` directly.
//
// useSyncExternalStore, not useState + an effect: the value is never COPIED into a
// component. Every mounted control renders straight from the attribute on <html>
// (the snapshot) and re-renders whenever lib/themePreference says it changed, so
// two controls cannot drift apart — there is no second copy to drift.
//
// The SERVER snapshot is 'system': the server cannot see the preference. React
// renders that during hydration and then switches to the real snapshot without a
// mismatch error. The page's COLOURS are already right before paint
// (THEME_INIT_SCRIPT in <head>); only the controls' own indicator settles a tick later.
//
// `persisted` is false after a choice that changed the page but will not survive a
// reload (storage blocked). The settings control says so instead of pretending.

function subscribe(onStoreChange) {
  return subscribeThemePreference(() => onStoreChange(), {
    root: document.documentElement,
    target: window,
  })
}

const getSnapshot = () => currentThemePreference(document.documentElement)
const getServerSnapshot = () => 'system'

export default function useThemePreference() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [persisted, setPersisted] = useState(true)

  const choose = useCallback(next => {
    const result = setThemePreference(next, {
      root: document.documentElement,
      storage: safeStorage(window),
      target: window,
    })
    setPersisted(result.persisted)
  }, [])

  return { theme, choose, persisted }
}
