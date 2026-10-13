// lib/models.js — which model each role runs on, the request shape it needs, and what it costs.
//
// ONE PLACE, because the literals drifted. Before 2026-10-12 every route named its model
// twice (the request, then recordAnthropicUsage) as independent string literals — 27 of
// them across 13 files. Changing one and not its twin logs spend against a model that
// never ran, and nothing notices: the usage row looks perfectly ordinary.
// (Structure ported from hold/model-upgrade-5-5 f9ee361; that branch's Sonnet 5.5 /
// Haiku 5.5 swaps were NOT taken — only the coach moves.)
//
// PURE: no Anthropic import, no Next import. Bare node (scripts/prompt-harness) imports it.
//
// A MODEL CHANGE IS A PROMPT CHANGE. Run `npm run test:prompts` after touching COACH_MODEL —
// the harness reads it from here, so it tests what ships.

export const SONNET_4_6 = 'claude-sonnet-4-6'
export const HAIKU_4_5 = 'claude-haiku-4-5-20251001'
export const OPUS_5_5 = 'claude-opus-5-5'

// The live Socratic coach (/api/tutor, /api/gym/tutor). Moved to Opus 5.5 on 2026-10-12
// (Robert's call: it measurably gets students writing more and finishes more essays in
// range). Confirmed live via GET /v1/models/claude-opus-5-5 that day.
export const COACH_MODEL = OPUS_5_5
// The Head Grader's observe-only rubric review (lib/gradeAgainstRubric.js). Unchanged.
export const REVIEW_MODEL = SONNET_4_6
// The transcript-audit judge (lib/auditJudge.js) — the one that flags guardrail breaches.
// Unchanged.
export const JUDGE_MODEL = SONNET_4_6
// Everything high-volume and mechanical: scribe cleanup, paragraph/essay assembly,
// assignment parse + metadata, summaries, rubric OCR, writing analysis, gym placement,
// and the audit's technical screen. Unchanged.
export const UTILITY_MODEL = HAIKU_4_5

// ── Request shape per model ──────────────────────────────────────────────────
// claude-opus-5-5 (each measured with a real call, 2026-10-12):
//   • Thinking CANNOT be turned off. {type:'disabled'} and {type:'enabled', budget_tokens}
//     are both 400s; omitting `thinking` runs ADAPTIVE thinking, so we omit it.
//   • Effort is the only lever, and its default is MEDIUM — ~15.8s to the first word in
//     this morning's measurement, which is dead air in a voice product. `low` measured
//     ~4.7s median. Set explicitly, inside output_config (not top-level).
//   • temperature / top_p / top_k are 400s ("deprecated for this model"). No call in this
//     repo sends them (grep-verified 2026-10-12).
//   • With display omitted (the default) a reply streams a `thinking` block whose text is
//     EMPTY (one empty thinking_delta + a signature_delta), then the text block. Anything
//     that reads content[0].text gets the thinking block — read by TYPE (responseText,
//     lib/coachStream.js).
// The 4.x models keep running with nothing extra, exactly as before.
export const MODEL_REQUEST_OPTIONS = {
  [OPUS_5_5]: { output_config: { effort: 'low' } },
}

/** Extra request fields a model needs. Spread into every messages.create / .stream call. */
export function requestOptionsFor(model) {
  return MODEL_REQUEST_OPTIONS[model] ?? {}
}

// ── The coach's output ceiling ───────────────────────────────────────────────
// This is NOT "how much may the coach say". A [DONE:id:…] payload carries the student's
// EXACT words, so the ceiling is how long a piece of THEIR writing may be (see the note
// in app/api/tutor/route.js — it cut a real student's story at 1000). On Sonnet 4.6 it was
// 4000 tokens ≈ 2,500 words of payload.
//
// On Opus 5.5 two things eat into the same number:
//   1. the newer tokenizer — measured 2026-10-12 with count_tokens on the repo's synthetic
//      342-word [DONE:] passage: 390 tokens on Sonnet 4.6, 489 on Opus 5.5 (×1.25). Holding
//      the same 2,500 words of student writing needs ~5,000 tokens.
//   2. adaptive thinking — thinking tokens count against max_tokens and arrive BEFORE the
//      text. At effort low, across 168 real coach turns on 2026-10-12 (the full prompt suite
//      + the latency harness; TESTING.md), thinking was median 190, p95 495, MAX 674 tokens.
// 8,000 − 4,000 × 1.254 = ~2,984 tokens left for thinking even on a payload as long as the
// longest Sonnet 4.6 could hold — 4.4× the largest thinking we measured. (The same figure
// this morning's eval ran at.) Billed on ACTUAL output, so an ordinary turn costs exactly
// what it would at 4,000. stop_reason 'max_tokens' is still detected and recorded by both
// coach routes (0 of 317 measured calls hit it).
export const COACH_MAX_TOKENS = {
  [SONNET_4_6]: 4000,
  [OPUS_5_5]: 8000,
}
export function coachMaxTokens(model = COACH_MODEL) {
  const n = COACH_MAX_TOKENS[model]
  if (!n) throw new Error(`[models] no coach max_tokens for ${model} — set one in lib/models.js (it bounds the STUDENT's words)`)
  return n
}

// ── Pricing, USD per million tokens ──────────────────────────────────────────
// Source: https://platform.claude.com/docs/en/about-claude/pricing, fetched 2026-10-12.
//   input        = base input (the API's `input_tokens`, which EXCLUDES cached tokens)
//   cacheWrite   = 5-minute cache write (`cache_creation_input_tokens`; the coach uses the
//                  default 5m TTL)
//   cacheRead    = cache hits and refreshes (`cache_read_input_tokens`)
//   output       = output, INCLUDING thinking tokens (thinking is billed as output; the
//                  API's `output_tokens` already counts them)
// Opus 5.5 cache reads are 0.05× input ($0.20), not the usual 0.1×.
// Opus 5.5 and the 4.x models here bill the full 1M context at one rate (no long-context
// card).
export const ANTHROPIC_PRICING = {
  [SONNET_4_6]: { input: 3, cacheWrite: 3.75, cacheRead: 0.30, output: 15 },
  [HAIKU_4_5]: { input: 1, cacheWrite: 1.25, cacheRead: 0.10, output: 5 },
  [OPUS_5_5]: { input: 4, cacheWrite: 5, cacheRead: 0.20, output: 20 },
}

/**
 * Cost of one call in USD, or null when the model has no price.
 * NULL, never a guess: an unpriced model must not be quietly billed at another model's
 * rate (the old fallback charged every unknown model as Sonnet 4.6 — on Opus 5.5 that
 * would have under-reported output by 25% forever, silently).
 *
 * Cache tokens are priced too. The coach's ~41.8k-token static prefix is cached, so its
 * `input_tokens` is a few hundred while the real prompt cost is the cache write/read —
 * pricing input_tokens alone under-reports a coach turn by an order of magnitude.
 */
export function priceCall(model, { inputTokens = 0, outputTokens = 0, cacheWriteTokens = 0, cacheReadTokens = 0 } = {}) {
  const p = ANTHROPIC_PRICING[model]
  if (!p) return null
  return (inputTokens * p.input + cacheWriteTokens * p.cacheWrite + cacheReadTokens * p.cacheRead + outputTokens * p.output) / 1_000_000
}

/** The API `usage` object → priceCall's argument shape. */
export function usageTokens(u = {}) {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
  }
}
