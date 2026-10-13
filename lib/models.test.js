import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import {
  COACH_MODEL, REVIEW_MODEL, JUDGE_MODEL, UTILITY_MODEL,
  OPUS_5_5, SONNET_4_6, HAIKU_4_5,
  ANTHROPIC_PRICING, priceCall, usageTokens, requestOptionsFor, coachMaxTokens,
} from './models.js'
import { responseText } from './modelResponse.js'

const ROLES = { COACH_MODEL, REVIEW_MODEL, JUDGE_MODEL, UTILITY_MODEL }

describe('roles — only the coach moved (2026-10-12)', () => {
  it('the coach runs on Opus 5.5', () => {
    expect(COACH_MODEL).toBe('claude-opus-5-5')
  })
  it('review / judge / utility are EXACTLY what prod ran before the move', () => {
    expect(REVIEW_MODEL).toBe('claude-sonnet-4-6')
    expect(JUDGE_MODEL).toBe('claude-sonnet-4-6')
    expect(UTILITY_MODEL).toBe('claude-haiku-4-5-20251001')
  })
})

describe('every role model is priced — an unpriced model must fail HERE, not log $0 in prod', () => {
  for (const [role, model] of Object.entries(ROLES)) {
    it(`${role} (${model}) has a price`, () => {
      expect(ANTHROPIC_PRICING[model], `${model} is missing from ANTHROPIC_PRICING`).toBeTruthy()
      expect(priceCall(model, { inputTokens: 1000, outputTokens: 1000 })).toBeGreaterThan(0)
    })
  }
})

describe('priceCall — published rates (platform.claude.com/docs/en/about-claude/pricing, 2026-10-12)', () => {
  it('Opus 5.5: $4 in / $5 5m-cache-write / $0.20 cache read / $20 out per MTok', () => {
    expect(priceCall(OPUS_5_5, { inputTokens: 1e6 })).toBeCloseTo(4)
    expect(priceCall(OPUS_5_5, { cacheWriteTokens: 1e6 })).toBeCloseTo(5)
    expect(priceCall(OPUS_5_5, { cacheReadTokens: 1e6 })).toBeCloseTo(0.2)
    expect(priceCall(OPUS_5_5, { outputTokens: 1e6 })).toBeCloseTo(20)
  })
  it('the 4.x rates are unchanged', () => {
    expect(priceCall(SONNET_4_6, { inputTokens: 1e6, outputTokens: 1e6 })).toBeCloseTo(18)
    expect(priceCall(SONNET_4_6, { cacheWriteTokens: 1e6, cacheReadTokens: 1e6 })).toBeCloseTo(3.75 + 0.3)
    expect(priceCall(HAIKU_4_5, { inputTokens: 1e6, outputTokens: 1e6 })).toBeCloseTo(6)
  })
  it('a real Opus 5.5 coach turn is priced from ALL its usage fields (measured shapes, 2026-10-12)', () => {
    // Turn 1 of a session WROTE the 41,800-token static prefix to cache; turn 2 READ it.
    const t1 = { input_tokens: 83, cache_creation_input_tokens: 41800, cache_read_input_tokens: 0, output_tokens: 205 }
    const t2 = { input_tokens: 248, cache_creation_input_tokens: 0, cache_read_input_tokens: 41800, output_tokens: 521 }
    const p1 = priceCall(OPUS_5_5, usageTokens(t1))
    const p2 = priceCall(OPUS_5_5, usageTokens(t2))
    expect(p1).toBeCloseTo((83 * 4 + 41800 * 5 + 205 * 20) / 1e6, 8)   // ≈ $0.2134
    expect(p2).toBeCloseTo((248 * 4 + 41800 * 0.2 + 521 * 20) / 1e6, 8) // ≈ $0.0198
    // Pricing input_tokens + output_tokens alone (the pre-2026-10-12 behaviour) logs the
    // cache-write turn at under a tenth of what it cost.
    expect(priceCall(OPUS_5_5, { inputTokens: 83, outputTokens: 205 })).toBeLessThan(p1 / 10)
  })
  it('an unknown model is NULL — never silently billed at another model\'s rate', () => {
    expect(priceCall('claude-imaginary-9', { inputTokens: 1000, outputTokens: 1000 })).toBeNull()
  })
  it('usageTokens tolerates a missing / partial usage object', () => {
    expect(usageTokens(undefined)).toEqual({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 })
    expect(usageTokens({ input_tokens: 5 }).inputTokens).toBe(5)
  })
})

describe('request shape per model', () => {
  it('Opus 5.5 sends effort low via output_config — and NO thinking field (disabled/enabled are 400s)', () => {
    const o = requestOptionsFor(OPUS_5_5)
    expect(o).toEqual({ output_config: { effort: 'low' } })
    expect(o).not.toHaveProperty('thinking')
    expect(o).not.toHaveProperty('effort') // top-level effort is not the API field
  })
  it('the 4.x models get nothing extra — the roles that did not move send what they sent before', () => {
    expect(requestOptionsFor(SONNET_4_6)).toEqual({})
    expect(requestOptionsFor(HAIKU_4_5)).toEqual({})
    expect(requestOptionsFor(REVIEW_MODEL)).toEqual({})
    expect(requestOptionsFor(JUDGE_MODEL)).toEqual({})
    expect(requestOptionsFor(UTILITY_MODEL)).toEqual({})
  })
  it('no options object carries sampling params or a thinking budget (400 on Opus 5.5)', () => {
    for (const m of Object.values(ROLES)) {
      const o = requestOptionsFor(m)
      expect(o).not.toHaveProperty('temperature')
      expect(o).not.toHaveProperty('top_p')
      expect(o).not.toHaveProperty('top_k')
      expect(JSON.stringify(o)).not.toMatch(/budget_tokens|"disabled"/)
    }
  })
})

describe('coach max_tokens — it bounds the STUDENT\'s words in a [DONE:] payload', () => {
  it('Sonnet 4.6 keeps 4000; Opus 5.5 gets 8000 (×1.25 tokenizer + thinking headroom)', () => {
    expect(coachMaxTokens(SONNET_4_6)).toBe(4000)
    expect(coachMaxTokens(OPUS_5_5)).toBe(8000)
  })
  it('holds as many student words on Opus as 4000 did on Sonnet, with ≥4× the largest measured thinking to spare', () => {
    // Measured 2026-10-12: tokenizer ratio 489/390 on the repo's synthetic 342-word passage
    // (count_tokens), and thinking at effort low max 674 tokens over 168 real coach turns.
    const RATIO = 489 / 390
    const MAX_MEASURED_THINKING = 674
    const payloadAtSonnetCeiling = coachMaxTokens(SONNET_4_6) * RATIO   // same words, Opus tokens
    const leftForThinking = coachMaxTokens(OPUS_5_5) - payloadAtSonnetCeiling
    expect(leftForThinking).toBeGreaterThanOrEqual(4 * MAX_MEASURED_THINKING)
  })
  it('a model with no ceiling THROWS rather than guessing one', () => {
    expect(() => coachMaxTokens('claude-imaginary-9')).toThrow(/max_tokens/)
  })
  it('the coach model has one', () => {
    expect(coachMaxTokens()).toBeGreaterThan(0)
  })
})

describe('roles that still read content[0].text must stay on models that do not think', () => {
  // UTILITY (scribe, assembly, summary, metadata, analysis, placement) and JUDGE read the
  // reply POSITIONALLY. That is correct on Haiku 4.5 / Sonnet 4.6, which return a single
  // text block. Opus 5.5 always opens with a thinking block: moving any of these roles to it
  // without switching those reads to responseText() would read `undefined` and throw — or,
  // in assembly, hand the student an empty paragraph. Fail here first.
  const THINKS_ALWAYS = [OPUS_5_5]
  for (const [role, model] of Object.entries({ REVIEW_MODEL, JUDGE_MODEL, UTILITY_MODEL })) {
    it(`${role} (${model}) is not an always-thinking model`, () => {
      expect(THINKS_ALWAYS).not.toContain(model)
    })
  }
})

describe('responseText reads by block TYPE (an Opus 5.5 reply opens with a thinking block)', () => {
  it('skips a leading thinking block', () => {
    expect(responseText({ content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: '{"ok":true}' }] })).toBe('{"ok":true}')
  })
  it('never returns thinking content, even when it is non-empty', () => {
    expect(responseText({ content: [{ type: 'thinking', thinking: 'secret reasoning' }, { type: 'text', text: 'hi' }] })).toBe('hi')
  })
  it('joins several text blocks, and is "" on garbage', () => {
    expect(responseText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('ab')
    expect(responseText(null)).toBe('')
    expect(responseText({ content: [{ type: 'thinking' }] })).toBe('')
  })
})

describe('no stray model literals outside lib/models.js', () => {
  // Each route used to name its model twice (request + usage log) as independent literals.
  // Any new literal in app/ or lib/ reintroduces that drift.
  it('app/ and lib/ name models only through lib/models.js', () => {
    const root = join(import.meta.dirname, '..')
    let hits = ''
    try {
      hits = execSync(`git grep --untracked -n -E "'claude-(sonnet|haiku|opus|fable|mythos)-[0-9a-z-]+'" -- 'app/**/*.js' 'lib/*.js'`, { cwd: root, encoding: 'utf8' })
    } catch { hits = '' } // git grep exits 1 on no match
    const offenders = hits.split('\n').filter(Boolean)// Tests PIN expected ids on purpose (asserting the coach row says 'claude-opus-5-5'); the
      // drift this guards against is in shipped code.
      .filter(l => !l.startsWith('lib/models.js') && !/^[^:]+\.test\.js:/.test(l))
    expect(offenders, offenders.join('\n')).toEqual([])
  })
  it('positive control: the same grep DOES see the literals in lib/models.js', () => {
    const root = join(import.meta.dirname, '..')
    const hits = execSync(`git grep --untracked -n -E "'claude-(sonnet|haiku|opus|fable|mythos)-[0-9a-z-]+'" -- 'lib/models.js'`, { cwd: root, encoding: 'utf8' })
    expect(hits).toMatch(/claude-opus-5-5/)
  })
})
