import { describe, it, expect } from 'vitest'
import { maybeGrantBetaCircle, BETA_CIRCLE_CAP, canReachCoach, coachGateFailure } from '@/lib/access'

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

// ── The coach reachability gate (Beta access-gate bypass fix) ────────────────
// canReachCoach = canUseCoach (COPPA) AND access_granted === true. The bug it
// closes: the Beta access gate was enforced ONLY at session-CREATE, so an authed
// 13+ user with access_granted=false could still call /api/tutor, /api/speak, etc.
// directly. These lock BOTH conditions so neither half can silently drift off.

// Profiles that PASS the COPPA predicate (canUseCoach), one per allowed path.
const COPPA_PASSING = {
  admin:          { role: 'admin' },
  consentGiven:   { role: 'student', coppa_consent_given: true },
  thirteenPlus:   { role: 'student', age_bracket: '13plus', coppa_consent_required: false },
}
// A profile that FAILS COPPA: under-13 with an outstanding consent requirement.
const COPPA_FAILING = { role: 'student', age_bracket: 'under13', coppa_consent_required: true }

describe('canReachCoach — COPPA AND the Beta access gate', () => {
  for (const [name, base] of Object.entries(COPPA_PASSING)) {
    it(`${name} + access_granted → true`, () => {
      expect(canReachCoach({ ...base, access_granted: true })).toBe(true)
    })
    // THE BUG: COPPA passes but no Beta access → must still be denied.
    it(`${name} WITHOUT access_granted → false (even though COPPA passes)`, () => {
      expect(canReachCoach({ ...base, access_granted: false })).toBe(false)
    })
  }

  it('COPPA-fail → false regardless of access_granted', () => {
    expect(canReachCoach({ ...COPPA_FAILING, access_granted: true })).toBe(false)
    expect(canReachCoach({ ...COPPA_FAILING, access_granted: false })).toBe(false)
  })

  it('fails CLOSED on a missing/odd access_granted (undefined, null, truthy-not-true)', () => {
    expect(canReachCoach({ role: 'admin' })).toBe(false)                       // access_granted undefined
    expect(canReachCoach({ role: 'admin', access_granted: null })).toBe(false)
    expect(canReachCoach({ role: 'admin', access_granted: 'true' })).toBe(false) // string, not boolean true
    expect(canReachCoach({ role: 'admin', access_granted: 1 })).toBe(false)
  })

  it('a null/empty profile can never reach the coach', () => {
    expect(canReachCoach(null)).toBe(false)
    expect(canReachCoach(undefined)).toBe(false)
    expect(canReachCoach({})).toBe(false)
  })
})

describe('coachGateFailure — the right 403 per failure mode, or null', () => {
  const readBody = async (res) => ({ status: res.status, ...(await res.json()) })

  it('returns null when the user may reach the coach', () => {
    expect(coachGateFailure({ role: 'admin', access_granted: true })).toBeNull()
    expect(coachGateFailure({ role: 'student', coppa_consent_given: true, access_granted: true })).toBeNull()
  })

  it('COPPA failure → the COPPA 403 (age_verification_required), checked FIRST', async () => {
    // access_granted true is irrelevant — COPPA is the first gate.
    const res = coachGateFailure({ ...COPPA_FAILING, access_granted: true })
    expect(res).not.toBeNull()
    const body = await readBody(res)
    expect(body.status).toBe(403)
    expect(body.code).toBe('age_verification_required')
  })

  it('COPPA passes but no access → the access 403 (access_code_required)', async () => {
    const res = coachGateFailure({ role: 'admin', access_granted: false })
    expect(res).not.toBeNull()
    const body = await readBody(res)
    expect(body.status).toBe(403)
    expect(body.code).toBe('access_code_required')
  })

  it('an under-13 with no consent AND no access still gets the COPPA code (COPPA wins)', async () => {
    const res = coachGateFailure({ ...COPPA_FAILING, access_granted: false })
    const body = await readBody(res)
    expect(body.code).toBe('age_verification_required')
  })
})
