import { describe, it, expect } from 'vitest'
import { shouldPing, isActiveNow, presenceLabel, PING_MS, IDLE_MS, COALESCE_MS, ACTIVE_MS } from './presence'

const NOW = new Date('2026-08-16T12:00:00Z').getTime()
const agoMs = ms => new Date(NOW - ms).toISOString()

describe('dial ordering (the property that makes lag invisible)', () => {
  it('the ACTIVE window is wider than the write cadence', () => {
    // If writes were less frequent than the "Active now" window, a genuinely present
    // user would flicker out of it between writes — the bug this design avoids.
    expect(ACTIVE_MS).toBeGreaterThan(COALESCE_MS)
  })
  it('pings more often than we write', () => {
    expect(PING_MS).toBeLessThanOrEqual(COALESCE_MS)
  })
})

describe('shouldPing', () => {
  const base = { visible: true, lastInputAt: NOW - 1000, lastPingAt: NaN, now: NOW }

  it('pings when visible and recently active', () => {
    expect(shouldPing(base)).toBe(true)
  })

  it('never pings while the tab is hidden', () => {
    expect(shouldPing({ ...base, visible: false })).toBe(false)
  })

  it('stops pinging once the user goes idle (abandoned open tab)', () => {
    expect(shouldPing({ ...base, lastInputAt: NOW - IDLE_MS - 1 })).toBe(false)
  })

  it('still pings just inside the idle cutoff', () => {
    expect(shouldPing({ ...base, lastInputAt: NOW - IDLE_MS + 1000 })).toBe(true)
  })

  it('rate-limits itself to one ping per interval', () => {
    expect(shouldPing({ ...base, lastPingAt: NOW - PING_MS + 1000 })).toBe(false)
    expect(shouldPing({ ...base, lastPingAt: NOW - PING_MS - 1 })).toBe(true)
  })

  it('treats missing input history as idle rather than active', () => {
    expect(shouldPing({ ...base, lastInputAt: undefined })).toBe(false)
  })
})

describe('isActiveNow', () => {
  it('true inside the active window, false outside', () => {
    expect(isActiveNow(agoMs(ACTIVE_MS - 1000), NOW)).toBe(true)
    expect(isActiveNow(agoMs(ACTIVE_MS + 1000), NOW)).toBe(false)
  })
  it('false for null/garbage', () => {
    expect(isActiveNow(null, NOW)).toBe(false)
    expect(isActiveNow('not-a-date', NOW)).toBe(false)
  })
})

describe('presenceLabel', () => {
  it('shows "Active now" across the whole coalescing window — the point of the design', () => {
    // A user pinging normally can be up to COALESCE_MS stale; that must still read
    // as present, not as "2 min ago".
    expect(presenceLabel(agoMs(COALESCE_MS), NOW)).toBe('Active now')
    expect(presenceLabel(agoMs(0), NOW)).toBe('Active now')
    expect(presenceLabel(agoMs(ACTIVE_MS), NOW)).toBe('Active now')
  })

  it('switches to minutes past the active window', () => {
    expect(presenceLabel(agoMs(ACTIVE_MS + 60_000), NOW)).toBe('6 min ago')
    expect(presenceLabel(agoMs(52 * 60_000), NOW)).toBe('52 min ago')
  })

  it('rolls up to hours, then days', () => {
    expect(presenceLabel(agoMs(90 * 60_000), NOW)).toBe('1h ago')
    expect(presenceLabel(agoMs(26 * 3600_000), NOW)).toBe('1d ago')
    expect(presenceLabel(agoMs(3 * 24 * 3600_000), NOW)).toBe('3d ago')
  })

  it('falls back to a date beyond a week', () => {
    expect(presenceLabel(agoMs(30 * 24 * 3600_000), NOW)).toMatch(/^[A-Z][a-z]{2} \d+$/)
  })

  it('never shows a future time when clocks skew', () => {
    expect(presenceLabel(new Date(NOW + 60_000).toISOString(), NOW)).toBe('Active now')
  })

  it('renders an em dash for no data', () => {
    expect(presenceLabel(null, NOW)).toBe('—')
    expect(presenceLabel('garbage', NOW)).toBe('—')
  })
})
