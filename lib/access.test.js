import { describe, it, expect } from 'vitest'
import { maybeGrantBetaCircle, BETA_CIRCLE_CAP } from '@/lib/access'

// Hand-rolled fake service-role client. Each `.from()` starts a fresh chain.
// - `.select('role, is_beta_circle').eq(...).maybeSingle()` → the profile row
// - `.select('id', { count: 'exact', head: true }).eq(...)` (awaited) → { count }
// - `.update({...}).eq(...)` (awaited) → { error }
// All issued updates are recorded on `service.updates` so tests can assert that
// the cap / idempotency / non-student branches issue NO write.
function makeService({ profile, count, updateError } = {}) {
  const updates = []
  return {
    updates,
    from() {
      const chain = { _count: false, _update: false }
      chain.select = (_cols, opts) => { if (opts?.count) chain._count = true; return chain }
      chain.update = (vals) => { chain._update = true; updates.push(vals); return chain }
      chain.eq = () => chain
      chain.maybeSingle = () => Promise.resolve({ data: profile ?? null })
      chain.then = (res, rej) => {
        const result = chain._update ? { error: updateError ?? null }
          : chain._count ? { count }
          : {}
        return Promise.resolve(result).then(res, rej)
      }
      return chain
    },
  }
}

describe('maybeGrantBetaCircle', () => {
  it('is a no-op for a non-student profile (parents/teachers never count)', async () => {
    const service = makeService({ profile: { role: 'parent', is_beta_circle: false }, count: 0 })
    expect(await maybeGrantBetaCircle(service, 'u1')).toBe(false)
    expect(service.updates).toHaveLength(0)
  })

  it('returns false and does not write when the profile is missing', async () => {
    const service = makeService({ profile: null, count: 0 })
    expect(await maybeGrantBetaCircle(service, 'u1')).toBe(false)
    expect(service.updates).toHaveLength(0)
  })

  it('is idempotent for a student already in the circle (no double count)', async () => {
    const service = makeService({ profile: { role: 'student', is_beta_circle: true }, count: 50 })
    expect(await maybeGrantBetaCircle(service, 'u1')).toBe(true)
    expect(service.updates).toHaveLength(0)
  })

  it('grants a slot to a student when the cohort is under the cap', async () => {
    const service = makeService({ profile: { role: 'student', is_beta_circle: false }, count: BETA_CIRCLE_CAP - 1 })
    expect(await maybeGrantBetaCircle(service, 'u1')).toBe(true)
    expect(service.updates).toEqual([{ is_beta_circle: true }])
  })

  it('refuses (no write) once the live count is at the cap', async () => {
    const service = makeService({ profile: { role: 'student', is_beta_circle: false }, count: BETA_CIRCLE_CAP })
    expect(await maybeGrantBetaCircle(service, 'u1')).toBe(false)
    expect(service.updates).toHaveLength(0)
  })

  it('returns false on a write miss even under the cap', async () => {
    const service = makeService({
      profile: { role: 'student', is_beta_circle: false },
      count: 10,
      updateError: { message: 'write failed' },
    })
    expect(await maybeGrantBetaCircle(service, 'u1')).toBe(false)
    // the write was attempted, but the caller's access is unaffected (returns false)
    expect(service.updates).toEqual([{ is_beta_circle: true }])
  })
})
