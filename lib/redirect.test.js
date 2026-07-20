import { describe, it, expect } from 'vitest'
import { safeNextPath } from '@/lib/redirect'

describe('safeNextPath — open-redirect guard for OAuth `next`', () => {
  it('passes through a plain local path', () => {
    expect(safeNextPath('/folder')).toBe('/folder')
  })

  it('passes through a local path with query string', () => {
    expect(safeNextPath('/invite?token=abc')).toBe('/invite?token=abc')
    expect(safeNextPath('/coppa/complete?token=x')).toBe('/coppa/complete?token=x')
  })

  it('rejects protocol-relative //host → fallback', () => {
    expect(safeNextPath('//evil.com')).toBe('/folder')
  })

  it('rejects backslash /\\host → fallback', () => {
    expect(safeNextPath('/\\evil.com')).toBe('/folder')
  })

  it('rejects an absolute off-site URL → fallback', () => {
    expect(safeNextPath('http://evil.com')).toBe('/folder')
    expect(safeNextPath('https://evil.com/path')).toBe('/folder')
  })

  it('rejects a non-slash-prefixed path → fallback', () => {
    expect(safeNextPath('folder')).toBe('/folder')
  })

  it('treats empty / null / undefined as fallback', () => {
    expect(safeNextPath('')).toBe('/folder')
    expect(safeNextPath(null)).toBe('/folder')
    expect(safeNextPath(undefined)).toBe('/folder')
  })

  it('respects a custom fallback', () => {
    expect(safeNextPath('//evil.com', '/login')).toBe('/login')
    expect(safeNextPath(null, '/login')).toBe('/login')
    // valid local path still wins over the fallback
    expect(safeNextPath('/welcome', '/login')).toBe('/welcome')
  })
})
