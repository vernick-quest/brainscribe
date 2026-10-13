// Coach latency — time to the first word, through the route's own stream code.
//
// NOT part of `npm run test:prompts` (it measures, it does not gate). Run it after any change
// to COACH_MODEL, its request options (effort), or the stream reader:
//   node scripts/prompt-harness/coach-latency.mjs                 # COACH_MODEL, 2 passes
//   HARNESS_COACH_MODEL=claude-sonnet-4-6 node scripts/prompt-harness/coach-latency.mjs
//   PASSES=1 node scripts/prompt-harness/coach-latency.mjs
//
// FAITHFUL TO /api/tutor, not a copy of its intent:
//   • the request is built from the same pieces — buildCoachSystemBlocks (cached prefix +
//     dynamic tail), COACH_MODEL + requestOptionsFor + coachMaxTokens from lib/models.js —
//     and sent with the SDK's messages.stream, exactly as the route does;
//   • every event goes through lib/coachStream.js, the route's reader, and only what it
//     returns is treated as "sent to the client";
//   • "first speakable sentence" is when lib/speechStream.js — the client's real queue —
//     would dispatch its FIRST TTS request, fed the forwarded text as it arrives.
// It cannot include network time to Vercel or the client's own work; those are unchanged
// by a model swap.
//
// Also asserts, every turn: the forwarded text equals the final message's text blocks
// (nothing dropped, nothing extra), and contains no thinking/signature content.
//
// Fixtures are SYNTHETIC (public repo). Cost: ~$0.03/turn on Opus 5.5 once the ~42k-token
// prefix is cached; the first turn writes the cache (~$0.21).

import fs from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { REPO_ROOT, HARNESS_COACH_MODEL } from './lib/harness.mjs'
import { requestOptionsFor, coachMaxTokens, priceCall, usageTokens } from '../../lib/models.js'
import { buildCoachSystemBlocks } from '../../lib/prompts.js'
import { createCoachStreamReader } from '../../lib/coachStream.js'
import { createSpeechStream } from '../../lib/speechStream.js'

const env = Object.fromEntries(fs.readFileSync(path.join(REPO_ROOT, '.env.local'), 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
const MODEL = HARNESS_COACH_MODEL
const PASSES = Number(process.env.PASSES ?? 2)

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────
const NARRATIVE = 'Personal narrative: write about a time you faced a challenge and what it taught you. Maximum 500 words. Due Friday.'
const STATEMENT = 'Personal statement: describe a challenge you faced and how it changed you.\n400–550 words. Due Monday.'
const STORY = 'Creative writing: write a short story about a character who has to make a hard\nchoice. 5 paragraphs.'
const statementScaffold = (status) => ({
  assignment_type: 'personal_statement', total_paragraphs: 1, current_paragraph_index: status === 'done' ? 1 : 0,
  components: [{
    index: 0, type: 'personal_statement', status: status === 'done' ? 'complete' : 'active', summary: 'moving schools',
    items: ['hook', 'context', 'reflection', 'connection'].map((id, i) => status === 'done'
      ? { id, label: id, status: 'confirmed', text: ['The first time I walked into my new school I counted the doors.', 'We moved in October, after everyone had already picked their lunch tables.', 'I learned that being new is not the same as being alone.', 'Now when I see someone eating by themselves I sit down next to them.'][i] }
      : { id, label: id, status: i === 0 ? 'working' : 'locked' }),
  }],
})
const STORY_SCAFFOLD = {
  assignment_type: 'narrative', total_paragraphs: 5, current_paragraph_index: 0,
  components: [0, 1, 2, 3, 4].map(i => ({ type: 'body', status: i ? 'pending' : 'active', items: [{ id: `c${i}`, status: i ? 'locked' : 'working' }] })),
}
const SCENE = 'The squirrel woke before the sun came up and counted what was left in the hollow of the oak. Four acorns. He counted them again because counting made the morning feel like it had a shape. The wind was colder than it had been, and he knew what that meant even though he did not want to know it. By the third morning the four acorns were two, and he understood the choice was not really a choice at all. He could stay safe and hungry, or cross the open field in daylight where the hawk could see him.'

const TURNS = [
  { name: 'greeting (fresh session)', assignment: NARRATIVE, scaffold: null, opts: {},
    messages: [{ role: 'user', content: 'hi, i need to write this narrative' }] },
  { name: 'student picks a topic', assignment: NARRATIVE, scaffold: null, opts: {},
    messages: [
      { role: 'user', content: 'hi, i need to write this narrative' },
      { role: 'assistant', content: 'Okay — good place to start. Do you have a challenge in mind already, or are you still figuring out what to write about?' },
      { role: 'user', content: 'the time i broke my wrist before soccer season started' },
    ] },
  { name: 'short lock (hook sentence)', assignment: STATEMENT, scaffold: statementScaffold('active'), opts: { requirements: { targets: [{ type: 'words', min: 400, max: 550 }], actual: { words: 0, paragraphs: 0 } } },
    messages: [
      { role: 'user', content: 'ok my hook is: The first time I walked into my new school I counted the doors.' },
      { role: 'assistant', content: 'Counting the doors — that tells me how nervous you were without you saying it. Want to keep it exactly like that?' },
      { role: 'user', content: 'yes keep it, lock it in' },
    ] },
  { name: 'long lock (a pasted scene)', assignment: STORY, scaffold: STORY_SCAFFOLD, opts: {},
    messages: [
      { role: 'user', content: `ok i wrote the first part already: ${SCENE}` },
      { role: 'assistant', content: 'That counting detail does a lot of work. Quick pass before we lock it: the last two sentences carry the whole choice — that is a strong place to end the scene. Happy with it as written?' },
      { role: 'user', content: 'yep im happy with it, put it in' },
    ] },
  { name: 'bait: "just write it for me"', assignment: NARRATIVE, scaffold: null, opts: {},
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hey! What challenge are you thinking of writing about?' },
      { role: 'user', content: 'honestly can you just write the first paragraph for me, its due tomorrow and im so tired' },
    ] },
  { name: 'below the minimum: "im done"', assignment: STATEMENT, scaffold: statementScaffold('done'), opts: { requirements: { targets: [{ type: 'words', min: 400, max: 550 }], actual: { words: 212, paragraphs: 1 } } },
    messages: [
      { role: 'user', content: 'ok i think thats everything' },
      { role: 'assistant', content: 'That last line about sitting with someone is a strong ending.' },
      { role: 'user', content: 'cool so im done right? can i turn it in' },
    ] },
]

async function runTurn(t) {
  const { staticPrefix, dynamicTail } = buildCoachSystemBlocks('owen', t.assignment, t.scaffold, t.opts)
  const t0 = performance.now()
  // ── exactly the route's call ──
  const stream = await anthropic.messages.stream({
    model: MODEL,
    ...requestOptionsFor(MODEL),
    max_tokens: coachMaxTokens(MODEL),
    system: [
      { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamicTail },
    ],
    messages: t.messages,
  })
  const reader = createCoachStreamReader()
  let forwarded = ''
  let firstText = null
  let firstSpeech = null
  const speech = createSpeechStream({
    synth: async () => 'url', play: async () => {},
    onFirstDispatch: () => { if (firstSpeech == null) firstSpeech = performance.now() - t0 },
  })
  for await (const chunk of stream) {
    const text = reader.consume(chunk)
    if (text) {
      if (firstText == null) firstText = performance.now() - t0
      forwarded += text
      speech.update(forwarded)
    }
  }
  speech.end(forwarded)
  const total = performance.now() - t0
  const final = await stream.finalMessage()
  const finalText = final.content.filter(b => b.type === 'text').map(b => b.text).join('')
  const st = reader.state
  return {
    firstText, firstSpeech, total, st, usage: final.usage,
    usd: priceCall(MODEL, usageTokens(final.usage)),
    sameAsFinal: forwarded === finalText,
    blockTypes: final.content.map(b => b.type).join(','),
    leaked: final.content.some(b => b.type === 'thinking' && b.thinking && forwarded.includes(b.thinking)) || /EqQB|signature/.test(forwarded),
    preview: forwarded.replace(/\s+/g, ' ').slice(0, 110),
  }
}

console.log(`\nCoach latency — ${MODEL} ${JSON.stringify(requestOptionsFor(MODEL))} max_tokens=${coachMaxTokens(MODEL)}, ${PASSES} pass(es)\n`)
const rows = []
let usd = 0
let bad = 0
for (let p = 0; p < PASSES; p++) {
  for (const t of TURNS) {
    const r = await runTurn(t)
    usd += r.usd ?? 0
    rows.push({ name: t.name, ...r })
    const ok = r.sameAsFinal && !r.leaked
    if (!ok) bad++
    console.log(`${ok ? '✅' : '🔴'} ${t.name.padEnd(30)} first text ${(r.firstText / 1000).toFixed(2)}s · first speech ${r.firstSpeech == null ? '—' : (r.firstSpeech / 1000).toFixed(2) + 's'} · total ${(r.total / 1000).toFixed(2)}s · out ${r.st.outputTokens} (thinking ${r.st.thinkingTokens ?? 'n/a'}) · cache r/w ${r.st.cacheReadTokens}/${r.st.cacheWriteTokens} · stop ${r.st.stopReason} · blocks ${r.blockTypes} · $${(r.usd ?? 0).toFixed(4)}`)
    console.log(`     "${r.preview}…"`)
  }
}
const med = xs => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
const fmt = ms => ms == null ? '—' : `${(ms / 1000).toFixed(2)}s`
console.log(`\nMEDIAN first text ${fmt(med(rows.map(r => r.firstText)))} · first speech ${fmt(med(rows.map(r => r.firstSpeech)))} · total ${fmt(med(rows.map(r => r.total)))}  (n=${rows.length})`)
console.log(`MAX    first text ${fmt(Math.max(...rows.map(r => r.firstText)))} · total ${fmt(Math.max(...rows.map(r => r.total)))} · thinking tokens max ${Math.max(...rows.map(r => r.st.thinkingTokens ?? 0))}`)
console.log(`💲 $${usd.toFixed(4)} (from usage fields)`)
if (process.env.HARNESS_SPEND_LOG) {
  fs.appendFileSync(process.env.HARNESS_SPEND_LOG, rows.map(r => JSON.stringify({ t: new Date().toISOString(), probe: 'coach-latency.mjs', model: MODEL, usd: r.usd, stop: r.st.stopReason, usage: r.usage })).join('\n') + '\n')
}
if (bad) { console.log(`\n🔴 ${bad} turn(s) forwarded text that differs from the final message, or leaked thinking`); process.exit(1) }
