import { describe, it, expect } from 'vitest'
import {
  draftKey, writeDraft, readDraft, clearDraft, clearDraftIfMatches, sweepExpiredDrafts, DRAFT_MAX_AGE_MS,
} from '@/lib/composerDraft'

// A stand-in for localStorage, plus the two ways real ones fail.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  // A Proxy so `Object.keys(storage)` enumerates the stored keys, the way a real
  // localStorage does — that is what sweepExpiredDrafts walks.
  const api = {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: k => { map.delete(k) },
    _map: map,
  }
  return new Proxy(api, {
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: (t, k) => (map.has(k)
      ? { value: map.get(k), enumerable: true, configurable: true }
      : Reflect.getOwnPropertyDescriptor(t, k)),
  })
}
const throwingStorage = () => ({
  getItem() { throw new Error('SecurityError') },
  setItem() { throw new Error('QuotaExceededError') },
  removeItem() { throw new Error('SecurityError') },
})

const NOW = 1_760_000_000_000

describe('writeDraft / readDraft — the round trip', () => {
  it('stores and returns the exact text, keyed by session', () => {
    const s = fakeStorage()
    expect(writeDraft(s, 'sess-1', 'her whole outline', 'listening', NOW)).toBe(true)
    expect(readDraft(s, 'sess-1', NOW).text).toBe('her whole outline')
    expect(s._map.has(draftKey('sess-1'))).toBe(true)
  })

  it('keeps sessions apart', () => {
    const s = fakeStorage()
    writeDraft(s, 'a', 'draft A', 'listening', NOW)
    writeDraft(s, 'b', 'draft B', 'listening', NOW)
    expect(readDraft(s, 'a', NOW).text).toBe('draft A')
    expect(readDraft(s, 'b', NOW).text).toBe('draft B')
  })

  it('preserves newlines and leading/trailing whitespace inside a real draft', () => {
    const s = fakeStorage()
    const text = '  Scene one.\n\n  Scene two.  '
    writeDraft(s, 'x', text, 'listening', NOW)
    expect(readDraft(s, 'x', NOW).text).toBe(text)
  })

  it('handles a paste the size of hers (1,076 words) without truncating', () => {
    const s = fakeStorage()
    const big = Array.from({ length: 1076 }, (_, i) => `word${i}`).join(' ')
    expect(writeDraft(s, 'x', big, 'listening', NOW)).toBe(true)
    expect(readDraft(s, 'x', NOW).text).toBe(big)
  })
})

// ⚠️ THE RULE THE BUG TURNS ON. Emptying the box is the gesture that lost her work; if the
// autosave recorded it, the recovery would faithfully hand back nothing.
describe('an empty draft NEVER overwrites a stored one', () => {
  it('refuses to write empty or whitespace-only text', () => {
    const s = fakeStorage()
    writeDraft(s, 'x', 'half an hour of work', 'listening', NOW)
    for (const empty of ['', '   ', '\n\n', '\t']) {
      expect(writeDraft(s, 'x', empty, 'listening', NOW)).toBe(false)
      expect(readDraft(s, 'x', NOW).text).toBe('half an hour of work')
    }
  })

  it('select-all-and-delete leaves the stored draft intact', () => {
    const s = fakeStorage()
    writeDraft(s, 'x', 'HER 1,076 WORDS', NOW)
    writeDraft(s, 'x', '', 'listening', NOW)                       // the cut
    expect(readDraft(s, 'x', NOW).text).toBe('HER 1,076 WORDS')
  })

  it('but a successful send DOES clear it — the one and only clear', () => {
    const s = fakeStorage()
    writeDraft(s, 'x', 'sent', 'listening', NOW)
    clearDraft(s, 'x')
    expect(readDraft(s, 'x', NOW)).toBeNull()
  })
})

describe('readDraft rejects — and deletes — anything it cannot vouch for', () => {
  it('returns null when nothing is stored', () => {
    expect(readDraft(fakeStorage(), 'x', NOW)).toBeNull()
  })

  it('drops an unparseable record instead of re-parsing it forever', () => {
    const s = fakeStorage({ [draftKey('x')]: '{not json' })
    expect(readDraft(s, 'x', NOW)).toBeNull()
    expect(s._map.has(draftKey('x'))).toBe(false)
  })

  it('drops a record from a future/older schema version', () => {
    const s = fakeStorage({ [draftKey('x')]: JSON.stringify({ v: 99, text: 'hi', at: NOW }) })
    expect(readDraft(s, 'x', NOW)).toBeNull()
    expect(s._map.has(draftKey('x'))).toBe(false)
  })

  it('drops a record with a missing or non-string text', () => {
    const s = fakeStorage({ [draftKey('x')]: JSON.stringify({ v: 1, at: NOW }) })
    expect(readDraft(s, 'x', NOW)).toBeNull()
  })

  it('expires at DRAFT_MAX_AGE_MS, and keeps everything younger', () => {
    const s = fakeStorage()
    writeDraft(s, 'x', 'old outline', 'listening', NOW)
    expect(readDraft(s, 'x', NOW + DRAFT_MAX_AGE_MS - 1).text).toBe('old outline')
    expect(readDraft(s, 'x', NOW + DRAFT_MAX_AGE_MS + 1)).toBeNull()
    expect(s._map.has(draftKey('x'))).toBe(false)
  })

  it('drops a record with no usable timestamp rather than keeping it forever', () => {
    const s = fakeStorage({ [draftKey('x')]: JSON.stringify({ v: 1, text: 'hi', at: 'soon' }) })
    expect(readDraft(s, 'x', NOW)).toBeNull()
  })
})

// Safari private mode throws on ACCESS, not just on write. A session must still open.
describe('a hostile or absent storage never throws', () => {
  it('survives a storage that throws on every operation', () => {
    const s = throwingStorage()
    expect(writeDraft(s, 'x', 'hi', 'listening', NOW)).toBe(false)   // reported, so the caller can log
    expect(readDraft(s, 'x', NOW)).toBeNull()
    expect(() => clearDraft(s, 'x')).not.toThrow()
  })

  it('treats a null storage (SSR) as a no-op', () => {
    expect(writeDraft(null, 'x', 'hi', 'listening', NOW)).toBe(false)
    expect(readDraft(null, 'x', NOW)).toBeNull()
    expect(() => clearDraft(null, 'x')).not.toThrow()
  })

  it('refuses to key anything on a missing session id', () => {
    const s = fakeStorage()
    expect(writeDraft(s, null, 'hi', 'listening', NOW)).toBe(false)
    expect(readDraft(s, undefined, NOW)).toBeNull()
    expect(s._map.size).toBe(0)
  })
})

// ── The fix's OWN worst bug, found by the red-team pass (2026-08-17) ───────────────
// An unconditional clear undid the never-write-empty rule from the other side, and
// MicButton makes it routine: tapping the mic fires onInterim('') and empties the box.
describe('clearDraftIfMatches — delete only the words you actually sent', () => {
  const OUTLINE = 'HER WHOLE OUTLINE, half an hour of it'

  it('clears when the stored draft IS what was sent', () => {
    const s = fakeStorage()
    writeDraft(s, 'x', OUTLINE, 'listening', NOW)
    expect(clearDraftIfMatches(s, 'x', OUTLINE, NOW)).toBe('cleared')
    expect(readDraft(s, 'x', NOW)).toBeNull()
  })

  it('tolerates the trim() the composer applies before sending', () => {
    const s = fakeStorage()
    writeDraft(s, 'x', '  outline\n', 'listening', NOW)
    expect(clearDraftIfMatches(s, 'x', 'outline', NOW)).toBe('cleared')
  })

  // THE regression test. Type an outline, tap the mic, send a spoken question.
  it('KEEPS the outline when a DIFFERENT message is sent (the mic-wipe path)', () => {
    const s = fakeStorage()
    writeDraft(s, 'x', OUTLINE, 'listening', NOW)          // 1. typed
    writeDraft(s, 'x', '', 'listening', NOW)               // 2. mic empties the box — refused
    expect(clearDraftIfMatches(s, 'x', 'what should I do next?', NOW)).toBe('kept')
    expect(readDraft(s, 'x', NOW).text).toBe(OUTLINE)      // 3. still hers
  })

  it('KEEPS a newer draft when a stale send resolves late', () => {
    const s = fakeStorage()
    writeDraft(s, 'x', 'the next passage', 'listening', NOW)
    expect(clearDraftIfMatches(s, 'x', 'ok', NOW)).toBe('kept')
    expect(readDraft(s, 'x', NOW).text).toBe('the next passage')
  })

  it('reports `absent` rather than `cleared` when there was nothing stored', () => {
    expect(clearDraftIfMatches(fakeStorage(), 'x', 'anything', NOW)).toBe('absent')
  })

  it('never clears on a non-string send', () => {
    const s = fakeStorage()
    writeDraft(s, 'x', OUTLINE, 'listening', NOW)
    expect(clearDraftIfMatches(s, 'x', undefined, NOW)).toBe('kept')
    expect(readDraft(s, 'x', NOW).text).toBe(OUTLINE)
  })
})

// The dictating box's button says "Add to essay". A restored CHAT message sitting in it
// becomes essay content the moment the student presses Enter out of habit.
describe('mode travels with the draft', () => {
  it('round-trips which box the words were typed into', () => {
    const s = fakeStorage()
    writeDraft(s, 'x', 'chat text', 'listening', NOW)
    expect(readDraft(s, 'x', NOW)).toEqual({ text: 'chat text', mode: 'listening' })
    writeDraft(s, 'x', 'essay text', 'dictating', NOW)
    expect(readDraft(s, 'x', NOW)).toEqual({ text: 'essay text', mode: 'dictating' })
  })

  it('a record written before mode existed reads back as null mode, not a crash', () => {
    const s = fakeStorage({ [draftKey('x')]: JSON.stringify({ v: 1, text: 'old', at: NOW }) })
    expect(readDraft(s, 'x', NOW)).toEqual({ text: 'old', mode: null })
  })
})

// readDraft only ever expired the key it was handed, and it is only ever handed the session
// being opened — so an abandoned session's draft lived forever and the pile grew one key
// per session. The module's own "bounded" comment was false until this.
describe('sweepExpiredDrafts — prune every session, not just this one', () => {
  it('removes expired drafts and leaves live ones alone', () => {
    const s = fakeStorage()
    writeDraft(s, 'live', 'still writing', 'listening', NOW)
    writeDraft(s, 'old-1', 'abandoned', 'listening', NOW - DRAFT_MAX_AGE_MS - 1)
    writeDraft(s, 'old-2', 'abandoned', 'listening', NOW - DRAFT_MAX_AGE_MS - 1)
    expect(sweepExpiredDrafts(s, NOW)).toBe(2)
    expect(readDraft(s, 'live', NOW).text).toBe('still writing')
    expect(s._map.size).toBe(1)
  })

  it('drops unparseable and timestamp-less records too', () => {
    const s = fakeStorage({
      [draftKey('bad')]: '{not json',
      [draftKey('undated')]: JSON.stringify({ v: 1, text: 'hi' }),
    })
    expect(sweepExpiredDrafts(s, NOW)).toBe(2)
    expect(s._map.size).toBe(0)
  })

  it('never touches keys that are not ours', () => {
    const s = fakeStorage({ 'some-other-app': 'x', 'brainscribe:onboarding': 'y' })
    expect(sweepExpiredDrafts(s, NOW)).toBe(0)
    expect(s._map.size).toBe(2)
  })

  it('is a no-op on a missing or hostile storage', () => {
    expect(sweepExpiredDrafts(null, NOW)).toBe(0)
    expect(() => sweepExpiredDrafts(throwingStorage(), NOW)).not.toThrow()
  })
})
