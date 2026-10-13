import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCoachStreamReader, coachTurnAbandoned } from './coachStream.js'

// Event sequences mirror what the API streamed on 2026-10-12 (shape captured from a real
// claude-opus-5-5 call at effort low; text synthetic).
const opusTurn = (texts, { stop = 'end_turn', thinking = '' } = {}) => [
  { type: 'message_start', message: { usage: { input_tokens: 83, cache_creation_input_tokens: 41800, cache_read_input_tokens: 0, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking } },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'EqQBCkYIBx…' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  ...texts.map(t => ({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: t } })),
  { type: 'content_block_stop', index: 1 },
  { type: 'message_delta', delta: { stop_reason: stop }, usage: { input_tokens: 83, cache_creation_input_tokens: 41800, cache_read_input_tokens: 0, output_tokens: 205, output_tokens_details: { thinking_tokens: 65 } } },
  { type: 'message_stop' },
]

function run(events) {
  const r = createCoachStreamReader()
  const forwarded = []
  for (const e of events) { const t = r.consume(e); if (t) forwarded.push(t) }
  return { forwarded, st: r.state }
}

describe('coach stream reader — only text reaches the client', () => {
  it('forwards exactly the text deltas of an Opus 5.5 turn, in order', () => {
    const { forwarded, st } = run(opusTurn(['Great — ', 'that is your hook. ', '[DONE:hook:I broke my wrist.]']))
    expect(forwarded.join('')).toBe('Great — that is your hook. [DONE:hook:I broke my wrist.]')
    expect(st.fullText).toBe(forwarded.join(''))
  })
  it('NEVER forwards thinking or signature content — even when thinking text is non-empty', () => {
    // display:'summarized' would put real text in thinking_delta. The reader must not depend
    // on today's default (empty) to keep reasoning out of the speech queue and token parser.
    const { forwarded, st } = run(opusTurn(['Hi.'], { thinking: 'The student wants me to write it for them.' }))
    expect(forwarded).toEqual(['Hi.'])
    expect(st.fullText).not.toMatch(/student wants/)
    expect(st.fullText).not.toMatch(/EqQB/)
    expect(st.droppedDeltas).toBe(2) // the thinking_delta and the signature_delta
  })
  it('a Sonnet 4.6 turn (no thinking block) reads exactly as before', () => {
    const { forwarded, st } = run([
      { type: 'message_start', message: { usage: { input_tokens: 31000, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Okay.' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 12 } },
    ])
    expect(forwarded).toEqual(['Okay.'])
    expect(st).toMatchObject({ inputTokens: 31000, outputTokens: 12, cacheWriteTokens: 0, cacheReadTokens: 0, thinkingTokens: null, stopReason: 'end_turn', droppedDeltas: 0 })
  })
})

describe('coach stream reader — usage and stop_reason', () => {
  it('captures uncached input, cache write/read, output (thinking included) and thinking tokens', () => {
    const { st } = run(opusTurn(['x']))
    expect(st).toMatchObject({ inputTokens: 83, cacheWriteTokens: 41800, cacheReadTokens: 0, outputTokens: 205, thinkingTokens: 65 })
  })
  it('stop_reason max_tokens is captured (truncation detection depends on it)', () => {
    expect(run(opusTurn(['[DONE:hook:half a sent'], { stop: 'max_tokens' })).st.stopReason).toBe('max_tokens')
  })
  it('stop_reason refusal is captured (the routes log it loudly)', () => {
    expect(run(opusTurn(['I'], { stop: 'refusal' })).st.stopReason).toBe('refusal')
  })
  it('ignores junk without throwing', () => {
    const r = createCoachStreamReader()
    expect(r.consume(null)).toBeNull()
    expect(r.consume({ type: 'ping' })).toBeNull()
    expect(r.consume({ type: 'content_block_delta' })).toBeNull()
  })
})

describe('coachTurnAbandoned — a client-aborted turn is not persisted; a finished one always is', () => {
  it('a normal completion is NOT abandoned (every stop_reason)', () => {
    for (const stopReason of ['end_turn', 'max_tokens', 'refusal', 'stop_sequence']) {
      expect(coachTurnAbandoned({ streamCancelled: false, signalAborted: false, stopReason })).toBe(false)
    }
  })
  it('positive control for the guard: request.signal aborting AFTER a finished turn does not discard it', () => {
    expect(coachTurnAbandoned({ streamCancelled: false, signalAborted: true, stopReason: 'end_turn' })).toBe(false)
  })
  it('the stream being cancelled mid-turn IS abandoned (the primary signal)', () => {
    expect(coachTurnAbandoned({ streamCancelled: true, signalAborted: false, stopReason: null })).toBe(true)
    expect(coachTurnAbandoned({ streamCancelled: true, signalAborted: true, stopReason: null })).toBe(true)
  })
  it('request.signal aborted with the model never finishing IS abandoned (the secondary signal)', () => {
    expect(coachTurnAbandoned({ streamCancelled: false, signalAborted: true, stopReason: null })).toBe(true)
  })
  it('defaults are "not abandoned" — a missing input can never drop a transcript row', () => {
    expect(coachTurnAbandoned()).toBe(false)
    expect(coachTurnAbandoned({ signalAborted: 'yes' })).toBe(false)
  })
})

// ── Wiring: the routes must actually USE the helper, before the writes it guards ──────────
// A pure helper that nothing calls protects nothing (lib/wiring.test.js has the history).
const ROOT = join(import.meta.dirname, '..')
const read = f => readFileSync(join(ROOT, f), 'utf8')
// Returns a list of problems; [] = wired. Exported shape kept local so the positive control
// below runs the SAME function on a source that is wired wrong.
function abortWiringProblems(src, guardedWrites) {
  const problems = []
  if (!/\bcancel\(\)\s*\{[\s\S]{0,200}?clientCancelled\s*=\s*true/.test(src)) problems.push('ReadableStream has no cancel() that sets clientCancelled')
  const call = src.search(/const abandoned = coachTurnAbandoned\(\{\s*streamCancelled: clientCancelled,\s*signalAborted: request\.signal\?\.aborted === true,\s*stopReason\s*\}\)/)
  if (call < 0) { problems.push('coachTurnAbandoned is not called with the stream + request signals'); return problems }
  const ret = src.slice(call).search(/if \(abandoned\) \{[\s\S]{0,600}?\n\s*return\n/)
  if (ret < 0) problems.push('no early return on abandoned')
  const usage = src.indexOf('recordAnthropicUsage(')
  if (usage < 0 || usage > call) problems.push('usage must still be recorded BEFORE the abandoned return (the tokens were billed)')
  for (const w of guardedWrites) {
    const at = src.indexOf(w)
    if (at < 0) problems.push(`write not found: ${w}`)
    else if (at < call) problems.push(`${w} happens BEFORE the abandoned check`)
  }
  return problems
}

describe('the coach routes skip partial-turn writes when the client aborted', () => {
  it('/api/tutor: no partial message, no commitments, no over-claim record on an aborted turn', () => {
    expect(abortWiringProblems(read('app/api/tutor/route.js'), [
      "from('messages').insert(", "from('coach_commitments')", "'record_lock_over_claim'",
    ])).toEqual([])
  })
  it('/api/gym/tutor: no partial message on an aborted turn', () => {
    expect(abortWiringProblems(read('app/api/gym/tutor/route.js'), ["from('messages').insert("])).toEqual([])
  })
  it('positive control: the same check FAILS on a route that writes before the abandoned check', () => {
    const src = read('app/api/tutor/route.js')
    // Move the message insert above the guard — the exact regression this test exists for.
    const broken = "await supabase.from('messages').insert({})\n" + src
    expect(abortWiringProblems(broken, ["from('messages').insert("]).join(' ')).toMatch(/BEFORE the abandoned check/)
    // And on a route with no cancel() at all.
    expect(abortWiringProblems(src.replace(/clientCancelled = true/, 'void 0'), []).join(' ')).toMatch(/no cancel\(\)/)
  })
})
