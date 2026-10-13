import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture what recordAnthropicUsage would insert — no DB. The service client is replaced
// by a stub; the assertion is on the ROW VALUES that would be written, not on a status.
const inserted = []
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: () => ({ insert: async row => { inserted.push(row); return { error: null } } }) }),
}))
vi.mock('next/server', () => ({ after: fn => fn() }))

const { recordAnthropicUsage, anthropicCost } = await import('./usage.js')
const { COACH_MODEL, UTILITY_MODEL } = await import('./models.js')

beforeEach(() => { inserted.length = 0 })

describe('recordAnthropicUsage — the coach row carries its real model and its full cost', () => {
  it('a cache-WRITE Opus 5.5 coach turn is billed at $5/MTok for the prefix (measured usage shape)', async () => {
    await recordAnthropicUsage({ model: COACH_MODEL, inputTokens: 83, outputTokens: 205, cacheWriteTokens: 41800, cacheReadTokens: 0, sessionId: 's', userId: 'u' })
    expect(inserted).toHaveLength(1)
    expect(inserted[0].model).toBe('claude-opus-5-5')
    // input_tokens keeps its meaning — the API's uncached input — so old dashboards read the same.
    expect(inserted[0].input_tokens).toBe(83)
    expect(inserted[0].output_tokens).toBe(205)
    expect(inserted[0].cost_usd).toBeCloseTo((83 * 4 + 41800 * 5 + 205 * 20) / 1e6, 8)
  })
  it('a cache-READ turn is billed at $0.20/MTok for the prefix', async () => {
    await recordAnthropicUsage({ model: COACH_MODEL, inputTokens: 248, outputTokens: 521, cacheReadTokens: 41800 })
    expect(inserted[0].cost_usd).toBeCloseTo((248 * 4 + 41800 * 0.2 + 521 * 20) / 1e6, 8)
  })
  it('callers that pass no cache counts (every utility route) cost exactly what they did before', async () => {
    await recordAnthropicUsage({ model: UTILITY_MODEL, inputTokens: 1000, outputTokens: 500 })
    expect(inserted[0].cost_usd).toBeCloseTo((1000 * 1 + 500 * 5) / 1e6, 8)
  })
})

describe('an UNPRICED model is loud, never silently billed at Sonnet 4.6', () => {
  it('writes 0 and logs a 🔴 error naming the model', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await recordAnthropicUsage({ model: 'claude-imaginary-9', inputTokens: 1000, outputTokens: 1000 })
    expect(inserted[0].cost_usd).toBe(0)
    expect(err.mock.calls.flat().join(' ')).toMatch(/UNPRICED MODEL "claude-imaginary-9"/)
    err.mockRestore()
  })
  it('positive control: a priced model does NOT log that error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(anthropicCost(COACH_MODEL, { inputTokens: 1, outputTokens: 1 })).toBeGreaterThan(0)
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
  })
})
