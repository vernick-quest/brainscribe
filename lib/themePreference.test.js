import { describe, it, expect } from 'vitest'
import {
  THEME_STORAGE_KEY, THEME_ORDER, THEME_INIT_SCRIPT, THEME_CHANGE_EVENT,
  normalizeTheme, nextTheme, themeAttribute, resolveTheme,
  safeStorage, currentThemePreference, applyThemeToDocument,
  setThemePreference, subscribeThemePreference,
} from './themePreference'

describe('normalizeTheme', () => {
  it.each(THEME_ORDER)('passes %s through', t => expect(normalizeTheme(t)).toBe(t))

  // localStorage is shared with other tabs, older builds and the console, so the
  // stored value is untrusted input. Anything unrecognised must fall back to
  // following the device rather than picking a theme or throwing.
  it.each([undefined, null, '', 'DARK', 'Dark', 'auto', 'os', '{}', 0, false, [], {}])(
    'falls back to system for %o', v => expect(normalizeTheme(v)).toBe('system'))
})

describe('nextTheme', () => {
  it('cycles system → light → dark → system', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })

  it('returns to the start after one full lap', () => {
    let t = 'system'
    for (let i = 0; i < THEME_ORDER.length; i++) t = nextTheme(t)
    expect(t).toBe('system')
  })

  it('recovers from a corrupt value instead of getting stuck', () => {
    expect(nextTheme('nonsense')).toBe('light')
  })
})

describe('themeAttribute', () => {
  it('writes the explicit choices', () => {
    expect(themeAttribute('dark')).toBe('dark')
    expect(themeAttribute('light')).toBe('light')
  })

  // The bug this prevents: leaving data-theme="dark" behind when the reader goes
  // back to System pins them to dark forever and the OS switch stops working.
  it('returns null for system, so the attribute is REMOVED not set', () => {
    expect(themeAttribute('system')).toBeNull()
    expect(themeAttribute('garbage')).toBeNull()
  })
})

describe('resolveTheme', () => {
  it('follows the device on system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('overrides the device when the reader chose explicitly', () => {
    expect(resolveTheme('dark', false)).toBe('dark')   // dark on a light machine
    expect(resolveTheme('light', true)).toBe('light')  // light on a dark machine
  })
})

describe('THEME_INIT_SCRIPT', () => {
  // It runs blocking in <head> before React exists. A throw there takes the whole
  // page down, and a missing guard means a flash of the wrong theme.
  it('is wrapped in try/catch — localStorage THROWS in some privacy modes', () => {
    expect(THEME_INIT_SCRIPT).toContain('try{')
    expect(THEME_INIT_SCRIPT).toContain('catch')
  })

  it('reads the same key the component writes', () => {
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY))
  })

  it('only ever sets the two explicit values, never "system"', () => {
    expect(THEME_INIT_SCRIPT).not.toContain('system')
  })

  it('has no closing script tag that could break out of the inline <script>', () => {
    expect(THEME_INIT_SCRIPT.toLowerCase()).not.toContain('</script')
  })

  // Actually run it against a fake window for each stored value, rather than
  // trusting that the string looks right.
  it.each([
    ['dark', 'dark'],
    ['light', 'light'],
    ['system', null],
    [null, null],
    ['tampered', null],
  ])('stored %o → data-theme %o', (stored, expected) => {
    let attr = null
    const scope = {
      localStorage: { getItem: () => stored },
      document: { documentElement: { setAttribute: (_, v) => { attr = v } } },
    }
    new Function('localStorage', 'document', THEME_INIT_SCRIPT)(scope.localStorage, scope.document)
    expect(attr).toBe(expected)
  })

  it('survives a localStorage that throws, leaving the OS default in charge', () => {
    let attr = null
    const ls = { getItem() { throw new Error('SecurityError: access denied') } }
    const doc = { documentElement: { setAttribute: (_, v) => { attr = v } } }
    expect(() => new Function('localStorage', 'document', THEME_INIT_SCRIPT)(ls, doc)).not.toThrow()
    expect(attr).toBeNull()
  })
})

// ── The one store: two controls, one setting ──────────────────────────────────────
// The header button and the account-page radio group both write through
// setThemePreference and both listen through subscribeThemePreference. These tests
// run that path against fakes of exactly the surfaces the browser gives it: an
// element with get/set/removeAttribute, a Storage, and an EventTarget.

function fakeRoot(initial = null) {
  const attrs = new Map()
  if (initial !== null) attrs.set('data-theme', initial)
  return {
    getAttribute: k => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: k => attrs.delete(k),
    has: k => attrs.has(k),
  }
}

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial))
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    has: k => m.has(k),
  }
}

const throwingStorage = {
  getItem() { throw new Error('SecurityError') },
  setItem() { throw new Error('QuotaExceededError') },
  removeItem() { throw new Error('SecurityError') },
}

// A real `storage` event can't be constructed with a key outside a browser, and the
// handler only reads `.key`/`.newValue`, so a plain Event carrying them is faithful.
function storageEvent(key, newValue) {
  const e = new Event('storage')
  Object.assign(e, { key, newValue })
  return e
}

describe('safeStorage', () => {
  it('returns the storage when it is reachable', () => {
    const ls = fakeStorage()
    expect(safeStorage({ localStorage: ls })).toBe(ls)
  })

  // window.localStorage is a GETTER that throws when site data is blocked.
  it('returns null — not a throw — when the getter itself throws', () => {
    const win = { get localStorage() { throw new Error('SecurityError') } }
    expect(safeStorage(win)).toBeNull()
  })

  it('returns null with no window at all (server render)', () => {
    expect(safeStorage(undefined)).toBeNull()
  })
})

describe('currentThemePreference — reads the attribute on <html>', () => {
  it.each([['dark', 'dark'], ['light', 'light'], [null, 'system'], ['tampered', 'system']])(
    'data-theme %o → %o', (attr, expected) => {
      expect(currentThemePreference(fakeRoot(attr))).toBe(expected)
    })

  it('falls back to system with no root', () => {
    expect(currentThemePreference(undefined)).toBe('system')
  })
})

describe('setThemePreference — the single write path', () => {
  it('paints, persists and announces an explicit choice', () => {
    const root = fakeRoot(), storage = fakeStorage(), target = new EventTarget()
    let heard = 0
    target.addEventListener(THEME_CHANGE_EVENT, () => { heard++ })

    const r = setThemePreference('dark', { root, storage, target })

    expect(r).toEqual({ theme: 'dark', persisted: true })
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(heard).toBe(1)
  })

  // The regression the original toggle guarded against: System must REMOVE both the
  // attribute and the stored value, or the reader stays pinned to their last choice.
  it('System removes the attribute AND the stored value', () => {
    const root = fakeRoot('dark'), storage = fakeStorage({ [THEME_STORAGE_KEY]: 'dark' })
    const r = setThemePreference('system', { root, storage, target: new EventTarget() })
    expect(r).toEqual({ theme: 'system', persisted: true })
    expect(root.has('data-theme')).toBe(false)
    expect(storage.has(THEME_STORAGE_KEY)).toBe(false)
  })

  it('normalizes a corrupt value to System instead of writing it', () => {
    const root = fakeRoot('dark'), storage = fakeStorage()
    expect(setThemePreference('Dark', { root, storage }).theme).toBe('system')
    expect(root.has('data-theme')).toBe(false)
    expect(storage.has(THEME_STORAGE_KEY)).toBe(false)
  })

  // Not a silent no-op: the page still changes, and the caller is TOLD it won't stick.
  it('reports persisted:false when storage throws, but still paints', () => {
    const root = fakeRoot()
    const r = setThemePreference('dark', { root, storage: throwingStorage })
    expect(r).toEqual({ theme: 'dark', persisted: false })
    expect(root.getAttribute('data-theme')).toBe('dark')
  })

  it('reports persisted:false with no storage at all', () => {
    expect(setThemePreference('light', { root: fakeRoot(), storage: null }).persisted).toBe(false)
  })

  it('announces only after the attribute is already set', () => {
    const root = fakeRoot(), target = new EventTarget()
    let seen = null
    target.addEventListener(THEME_CHANGE_EVENT, () => { seen = root.getAttribute('data-theme') })
    setThemePreference('light', { root, storage: fakeStorage(), target })
    expect(seen).toBe('light')
  })
})

describe('two controls, one setting — they can never disagree', () => {
  // Stand-ins for ThemeToggle (header) and ThemePreferenceControl (settings): each
  // shows the value its subscription last delivered. (The real hook is
  // useSyncExternalStore over the same subscribe + currentThemePreference snapshot.)
  function mountControl(env) {
    const control = { theme: currentThemePreference(env.root) }
    control.unsubscribe = subscribeThemePreference(t => { control.theme = t }, env)
    control.choose = t => { control.theme = setThemePreference(t, env).theme }
    return control
  }

  function page(storage = fakeStorage()) {
    return { root: fakeRoot(), storage, target: new EventTarget() }
  }

  it('choosing in settings moves the header, and vice versa, through every state', () => {
    const env = page()
    const header = mountControl(env), settings = mountControl(env)

    for (const [who, t] of [[settings, 'dark'], [header, 'light'], [settings, 'system'], [header, 'dark']]) {
      who.choose(t)
      expect(header.theme).toBe(t)
      expect(settings.theme).toBe(t)
      expect(currentThemePreference(env.root)).toBe(t)
    }
  })

  it('cycling the header button lands the settings control on the same value', () => {
    const env = page()
    const header = mountControl(env), settings = mountControl(env)
    for (let i = 0; i < 4; i++) {
      header.choose(nextTheme(header.theme))
      expect(settings.theme).toBe(header.theme)
    }
  })

  it('agree after a RELOAD: the init script restores what either control wrote', () => {
    const storage = fakeStorage()
    const before = page(storage)
    mountControl(before).choose('dark')

    // Reload: a fresh <html>, the blocking <head> script, then both controls mount.
    const after = { root: fakeRoot(), storage, target: new EventTarget() }
    new Function('localStorage', 'document', THEME_INIT_SCRIPT)(storage, { documentElement: after.root })
    const header = mountControl(after), settings = mountControl(after)
    expect(header.theme).toBe('dark')
    expect(settings.theme).toBe('dark')
  })

  it('a reload after choosing System brings back System, not the old explicit value', () => {
    const storage = fakeStorage()
    const env = page(storage)
    const c = mountControl(env)
    c.choose('dark')
    c.choose('system')

    const after = { root: fakeRoot(), storage, target: new EventTarget() }
    new Function('localStorage', 'document', THEME_INIT_SCRIPT)(storage, { documentElement: after.root })
    expect(mountControl(after).theme).toBe('system')
  })

  // Why the CURRENT value is read from the attribute rather than storage: with
  // storage blocked, a control mounting after the choice would otherwise say System
  // over a page that is visibly dark.
  it('agree even when storage is blocked and one control mounts later', () => {
    const env = { root: fakeRoot(), storage: throwingStorage, target: new EventTarget() }
    mountControl(env).choose('dark')
    expect(mountControl(env).theme).toBe('dark')
  })

  it('a change made in ANOTHER TAB repaints this page and moves both controls', () => {
    const env = page()
    const header = mountControl(env), settings = mountControl(env)

    env.target.dispatchEvent(storageEvent(THEME_STORAGE_KEY, 'dark'))
    expect(env.root.getAttribute('data-theme')).toBe('dark')
    expect([header.theme, settings.theme]).toEqual(['dark', 'dark'])

    // The other tab chose System → it REMOVED the key → newValue is null.
    env.target.dispatchEvent(storageEvent(THEME_STORAGE_KEY, null))
    expect(env.root.has('data-theme')).toBe(false)
    expect([header.theme, settings.theme]).toEqual(['system', 'system'])
  })

  it('another tab clearing ALL storage (key === null) means System', () => {
    const env = page()
    env.root.setAttribute('data-theme', 'dark')
    const c = mountControl(env)
    env.target.dispatchEvent(storageEvent(null, null))
    expect(c.theme).toBe('system')
    expect(env.root.has('data-theme')).toBe(false)
  })

  it('ignores storage events for unrelated keys', () => {
    const env = page()
    env.root.setAttribute('data-theme', 'dark')
    const c = mountControl(env)
    env.target.dispatchEvent(storageEvent('some-other-key', 'light'))
    expect(c.theme).toBe('dark')
    expect(env.root.getAttribute('data-theme')).toBe('dark')
  })

  it('a tampered value from another tab falls back to System, not a broken attribute', () => {
    const env = page()
    const c = mountControl(env)
    env.target.dispatchEvent(storageEvent(THEME_STORAGE_KEY, '"><script>'))
    expect(c.theme).toBe('system')
    expect(env.root.has('data-theme')).toBe(false)
  })

  it('an unmounted control stops listening', () => {
    const env = page()
    const gone = mountControl(env), live = mountControl(env)
    gone.unsubscribe()
    live.choose('dark')
    expect(gone.theme).toBe('system')
    expect(live.theme).toBe('dark')
  })

  it('subscribing without an event target is a harmless no-op', () => {
    expect(() => subscribeThemePreference(() => {}, {})()).not.toThrow()
  })
})

describe('applyThemeToDocument', () => {
  it('removes the attribute for System and sets it otherwise', () => {
    const root = fakeRoot('dark')
    applyThemeToDocument('system', root)
    expect(root.has('data-theme')).toBe(false)
    applyThemeToDocument('light', root)
    expect(root.getAttribute('data-theme')).toBe('light')
  })
})
