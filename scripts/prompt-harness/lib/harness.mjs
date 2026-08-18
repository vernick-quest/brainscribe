// scripts/prompt-harness/lib/harness.mjs — run the REAL coach prompt against the
// REAL model, fast and cheap.
//
// Why this exists: two prompt "fixes" shipped unverified, and the first silently
// didn't fire — the rule was in the file and the model never acted on it. A build
// and a unit test cannot catch that; only running the prompt can. One probe is
// ~4 seconds and about a cent.
//
// It builds the system prompt FROM SOURCE via buildCoachSystemBlocks() and sends it
// exactly the way /api/tutor does (cached static prefix + volatile tail as two
// blocks). If it drifts from the route, it stops testing the thing that ships —
// keep the block construction below identical to app/api/tutor/route.js.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)))

// Probes hit the real API, so they need the real key. .env.local is gitignored;
// never print its contents.
function loadEnv() {
  const file = path.join(REPO_ROOT, '.env.local')
  if (!fs.existsSync(file)) {
    console.error(`[prompt-harness] no .env.local at ${file} — cannot reach the API.`)
    process.exit(2)
  }
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8').split('\n')
      .filter(l => l.includes('=') && !l.trim().startsWith('#'))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
  )
}

/**
 * One coach turn against the real model.
 *
 * @param persona     persona id ('owen' by default)
 * @param assignment  assignment text, as /api/tutor re-reads it from the DB
 * @param scaffold    scaffold object or null (null = before the first [SCAFFOLD:])
 * @param opts        the same opts object buildCoachSystemBlocks receives
 * @param messages    conversation so far (defaults to a bare "hi")
 */
export async function coachTurn({ persona = 'owen', assignment, scaffold = null, opts = {}, messages = [{ role: 'user', content: 'hi' }], maxTokens = 900 } = {}) {
  const env = loadEnv()
  const { buildCoachSystemBlocks } = await import(path.join(REPO_ROOT, 'lib/prompts.js'))
  const { staticPrefix, dynamicTail } = buildCoachSystemBlocks(persona, assignment, scaffold, opts)

  // Mirror app/api/tutor/route.js exactly.
  const system = [
    { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicTail },
  ]

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system, messages }),
  })
  const json = await res.json()
  if (json.error) {
    console.error('[prompt-harness] API error:', JSON.stringify(json.error).slice(0, 300))
    process.exit(2)
  }
  return { text: json.content.find(b => b.type === 'text')?.text ?? '', dynamicTail, staticPrefix }
}

/**
 * A raw single-shot model call, for probes that test something other than a coach turn
 * (the assembler runs on Haiku with its own system prompt). Same env handling, so there is
 * only ever one place that knows how to reach the API.
 */
export async function callModel({ model, system, user, maxTokens = 4000 }) {
  const env = loadEnv()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  })
  const json = await res.json()
  if (json.error) {
    console.error('[prompt-harness] API error:', JSON.stringify(json.error).slice(0, 300))
    process.exit(2)
  }
  return {
    text: json.content.find(b => b.type === 'text')?.text ?? '',
    stopReason: json.stop_reason,
  }
}

// ── Tiny assertion reporter ──────────────────────────────────────────────────
// A probe asserts on the CONTENT of the reply, never on "did the call succeed".
const results = []

export function check(label, passed, detail = '') {
  results.push({ label, passed })
  console.log(`  ${passed ? '✅' : '🔴'} ${label}${detail ? ` — ${detail}` : ''}`)
}

/**
 * A check whose PASS RATE is the result, for behaviours that are genuinely probabilistic.
 *
 * ── Why a rate and not a retry ───────────────────────────────────────────────────────
 * Three different probes went red across one evening's full runs and all three
 * re-measured clean. The tempting fix is to retry until green. That is the wrong fix: a
 * suite that retries to green reports a behaviour which regressed from 100% to 50% as
 * PASSING, and the regressions this repo actually ships are exactly that shape — silent,
 * partial, and in the reassuring direction.
 *
 * So: run it N times, print what it scored, and fail below a threshold set from a MEASURED
 * baseline. "P3 passed 2/3" is information; "P3 passed (eventually)" is not.
 *
 * FIRST ask whether the fixture is the problem. grown-story probe 1 measured ~50% because
 * one confirmation turn left the coach free to ask again; a second confirmation took it to
 * 3/3 and the assertion stayed hard. Strengthen the fixture, weaken nothing — reach for
 * this only when the behaviour itself is legitimately variable.
 *
 * @param produce  async () => result — re-runs the whole turn, so variance is real variance
 * @param checks   [{ label, test(result) }]
 * @param threshold  minimum fraction that must pass; set it from what you measured
 */
export async function rateCheck({ label, runs = 3, produce, checks, threshold = 2 / 3 }) {
  const outcomes = checks.map(c => ({ ...c, passes: 0 }))
  for (let i = 0; i < runs; i++) {
    const result = await produce(i)
    for (const o of outcomes) {
      let ok = false
      try { ok = !!o.test(result) } catch { ok = false }
      if (ok) o.passes++
    }
  }
  const need = Math.ceil(threshold * runs)
  console.log(`  📊 ${label} — ${runs} runs, need ${need}/${runs}`)
  for (const o of outcomes) {
    check(`${o.label} [${o.passes}/${runs}]`, o.passes >= need, o.passes === runs ? '' : `rate ${(o.passes / runs * 100).toFixed(0)}%`)
  }
  return outcomes
}

export function report(probeName) {
  const failed = results.filter(r => !r.passed)
  console.log(`\n${failed.length === 0 ? '✅ PASS' : `🔴 FAIL (${failed.length})`} — ${probeName}\n`)
  return failed.length
}
