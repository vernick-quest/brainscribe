import { describe, it, expect } from 'vitest'
import {
  speakableProse, sentenceEnds, nextSpeechChunk, speechText, createSpeechStream,
  MIN_FIRST_CHUNK_CHARS, MAX_REQUESTS_PER_REPLY,
} from './speechStream'
import { stripCoachTokens } from './coachTokens'

// Synthetic fixtures only (public repo). The student text below is invented.
const STUDENT = 'My grandma kept bees behind the garage. Every summer the whole yard hummed.'

// Microtask-only flush: enough turns for synth → then → player → play to settle.
const flush = async () => { for (let i = 0; i < 12; i++) await null }
function deferred() {
  let resolve, reject
  const p = new Promise((res, rej) => { resolve = res; reject = rej })
  return { p, resolve, reject }
}

// A harness that records every TTS request and every play, with playback the test controls.
function harness({ live = () => true, synthFails = () => false, autoPlay = true, autoSynth = true } = {}) {
  const synthCalls = []
  const synthPending = []
  const played = []
  const playPending = []
  const revoked = []
  const fallbackCalls = []
  let firstDispatches = 0
  const s = createSpeechStream({
    synth: (text) => {
      synthCalls.push(text)
      if (synthFails(text)) return Promise.reject(new Error('TTS failed'))
      const url = `blob:${synthCalls.length}`
      if (autoSynth) return Promise.resolve(url)
      const d = deferred(); synthPending.push({ d, url }); return d.p
    },
    play: (url) => {
      played.push(url)
      if (autoPlay) return Promise.resolve()
      const d = deferred(); playPending.push(d); return d.p
    },
    revoke: (url) => revoked.push(url),
    fallback: async (text) => { fallbackCalls.push(text) },
    isLive: live,
    onFirstDispatch: () => { firstDispatches++ },
    warn: () => {},
  })
  return { s, synthCalls, synthPending, played, playPending, revoked, fallbackCalls, get firstDispatches() { return firstDispatches } }
}

// Feed a raw coach reply in small pieces, the way the stream arrives.
async function streamInto(s, raw, step = 3, onStep = null) {
  for (let i = step; i < raw.length + step; i += step) {
    s.update(raw.slice(0, Math.min(i, raw.length)))
    if (onStep) await onStep(raw.slice(0, Math.min(i, raw.length)))
  }
}

describe('speakableProse — the stricter view of the text that speech is cut from', () => {
  it('removes complete control tokens', () => {
    const { text, held } = speakableProse('[ACTIVE:hook]Nice work. [DONE:hook:' + STUDENT + '] What comes next?')
    expect(text).toBe('Nice work.  What comes next?')
    expect(held).toBe(false)
  })

  it('holds back everything after an unclosed "[" — a token still arriving', () => {
    const { text, held } = speakableProse('Nice work. [DONE:hook:My grandma kept')
    expect(text).toBe('Nice work. ')
    expect(held).toBe(true)
  })

  it('a payload that itself contains "[" does not leak (depth-aware)', () => {
    // The screen's liveDisplay cuts at the LAST "[", so it would show "[DONE:hook:She said "
    // here. Speech must never see any of it.
    const raw = 'Good. [DONE:hook:She said [quietly] that she was done'
    expect(speakableProse(raw).text).toBe('Good. ')
    const closed = raw + '.] Next?'
    expect(speakableProse(closed).text).toBe('Good.  Next?')
  })

  it('is prefix-stable as the stream grows (a spoken chunk can never change)', () => {
    const raw = `[SCAFFOLD:essay:3]Okay. That's a strong hook — it puts us right in the yard. [DONE:hook:${STUDENT}] [ACTIVE:context]Now, who is this about? Tell me one detail.`
    let prev = ''
    for (let i = 1; i <= raw.length; i++) {
      const { text } = speakableProse(raw.slice(0, i))
      expect(text.startsWith(prev)).toBe(true)
      prev = text
    }
  })

  it('matches what the student sees for a well-formed turn', () => {
    const raw = `[SCAFFOLD:essay:3]Okay. That's a strong hook. [DONE:hook:${STUDENT}][NUGGET:context:bees] Who is it about? [DICTATE][CARE][COMPLETE]`
    expect(speechText(speakableProse(raw).text)).toBe(speechText(stripCoachTokens(raw)))
  })
})

describe('sentenceEnds', () => {
  it('does not split abbreviations, list markers, or decimals', () => {
    expect(sentenceEnds('Mr. Smith said hi. Then')).toEqual([18])
    expect(sentenceEnds('1. Start here\n2. Then there')).toEqual([13])
    expect(sentenceEnds('It is 3.5 miles. Go')).toEqual([16])
  })
  it('a terminator at the very end counts only when more is known to follow', () => {
    expect(sentenceEnds('Nice work.')).toEqual([])
    expect(sentenceEnds('Nice work.', { endIsBoundary: true })).toEqual([10])
  })
  it('handles closing quotes and markdown after the terminator', () => {
    expect(sentenceEnds('**Nice.** Next')).toEqual([9])
    expect(sentenceEnds('She said "stop!" and left')).toEqual([16])
  })
})

describe('nextSpeechChunk', () => {
  it('first chunk merges a short opener instead of refusing to split (the old ≥8-char bug)', () => {
    const text = 'Okay. That is a strong hook. What happens next?'
    const r = nextSpeechChunk(text, 0, { first: true })
    expect(r.chunk).toBe('Okay. That is a strong hook.')
    expect(r.chunk.length).toBeGreaterThanOrEqual(MIN_FIRST_CHUNK_CHARS)
  })
  it('strips markdown asterisks from what goes to TTS', () => {
    expect(nextSpeechChunk('**Great** start, honestly. More', 0, {}).chunk).toBe('Great start, honestly.')
  })
  it('returns null until a sentence is complete', () => {
    expect(nextSpeechChunk('That is a strong hook and', 0, { first: true })).toBeNull()
  })
})

describe('createSpeechStream — voice starts with the text', () => {
  it('a short opener still speaks mid-stream, before the reply finishes', async () => {
    const h = harness()
    const raw = 'Okay. That is a strong hook, and it starts with a question. Now tell me who the bees belonged to, and why the yard mattered so much to you that summer.'
    let dispatchedAt = null
    await streamInto(h.s, raw, 3, async (sofar) => {
      if (dispatchedAt === null && h.synthCalls.length) dispatchedAt = sofar.length
    })
    expect(dispatchedAt).not.toBeNull()
    expect(dispatchedAt).toBeLessThan(raw.length / 2)
    expect(h.synthCalls[0]).toBe('Okay. That is a strong hook, and it starts with a question.')
  })

  it('a lock turn speaks its prose while the [DONE:] payload is still streaming', async () => {
    const h = harness()
    const raw = `That one's locked in — nice. [DONE:hook:${STUDENT} ${STUDENT} ${STUDENT}]`
    let dispatchedAt = null
    await streamInto(h.s, raw, 2, async (sofar) => {
      if (dispatchedAt === null && h.synthCalls.length) dispatchedAt = sofar.length
    })
    expect(dispatchedAt).not.toBeNull()
    expect(dispatchedAt).toBeLessThan(raw.indexOf(STUDENT))   // before ANY payload arrived
    h.s.end(raw)
    await h.s.done
    expect(h.synthCalls).toEqual(["That one's locked in — nice."])
  })
})

describe('createSpeechStream — never speaks a token or the student\'s locked words', () => {
  const FIXTURES = [
    `[SCAFFOLD:essay:3]Okay. That's a strong hook. [DONE:hook:${STUDENT}] [ACTIVE:context]Now, who is this about?`,
    `Nice. [NUGGET:context:${STUDENT}]Tell me more about the bees. What did they sound like?`,
    `Good. [DONE:hook:She said [quietly] ${STUDENT}] What next?`,
    // Truncated at max_tokens mid-payload: the token never closes.
    `That's locked in, nice work there. [DONE:hook:${STUDENT}`,
    `[THESIS:${STUDENT}]Your thesis is set. [PARA_DONE:0]On to the next paragraph! [SOURCE:${STUDENT}]`,
  ]
  for (const [i, raw] of FIXTURES.entries()) {
    it(`fixture ${i}: no synth call contains a token or student words, at any step size`, async () => {
      for (const step of [1, 2, 5, 17]) {
        const h = harness()
        await streamInto(h.s, raw, step)
        h.s.end(raw)
        await h.s.done
        const said = h.synthCalls.join(' ')
        expect(said).not.toMatch(/[[\]]/)
        expect(said).not.toMatch(/DONE|NUGGET|SCAFFOLD|ACTIVE|THESIS|PARA_DONE|SOURCE/)
        expect(said).not.toContain('grandma')
        expect(said).not.toContain('quietly')
      }
    })
  }

  it('a chunk with a stray "]" (payload closed early) is dropped, not spoken', async () => {
    const h = harness()
    const raw = 'Good. [DONE:hook:she wrote ] then the rest of her words.] What next?'
    h.s.end(raw)
    await h.s.done
    expect(h.synthCalls.join(' ')).not.toContain('rest of her words')
    expect(h.s.stats.dropped).toBe(1)
  })
})

describe('createSpeechStream — cost', () => {
  const LONG = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i + 1} of the reply, and it carries a thought.`).join(' ')

  it('chunks partition the prose: nothing spoken twice, nothing dropped, chars never exceed the display text', async () => {
    for (const raw of [LONG, `Okay. ${LONG} [DONE:hook:${STUDENT}]`, 'Short one.', `[SCAFFOLD:essay:3]**Okay.** ${LONG}`]) {
      for (const step of [1, 7, 40]) {
        const h = harness()
        await streamInto(h.s, raw, step, flush)
        h.s.end(raw)
        await h.s.done
        expect(h.synthCalls.join(' ')).toBe(speechText(speakableProse(raw).text))
        expect(h.s.stats.chars).toBeLessThanOrEqual(stripCoachTokens(raw).length)
      }
    }
  })

  it(`never makes more than ${MAX_REQUESTS_PER_REPLY} TTS requests per reply`, async () => {
    const h = harness()
    await streamInto(h.s, LONG, 1, flush)   // slow stream + instant playback = worst case
    h.s.end(LONG)
    await h.s.done
    expect(h.synthCalls.length).toBeLessThanOrEqual(MAX_REQUESTS_PER_REPLY)
    expect(h.played.length).toBe(h.synthCalls.length)
  })

  it('a reply that is only tokens makes zero requests and still settles', async () => {
    const h = harness()
    h.s.end('[ACTIVE:context][DICTATE]')
    await h.s.done
    expect(h.synthCalls).toEqual([])
  })
})

describe('createSpeechStream — interruption', () => {
  it('not live (read-aloud off) ⇒ zero TTS requests', async () => {
    const h = harness({ live: () => false })
    await streamInto(h.s, 'Okay. That is a strong hook and I like it a lot. What next?', 3)
    h.s.end('Okay. That is a strong hook and I like it a lot. What next?')
    await h.s.done
    expect(h.synthCalls).toEqual([])
    expect(h.played).toEqual([])
  })

  it('a TTS response that resolves AFTER cancel is revoked and never played', async () => {
    const h = harness({ autoSynth: false })
    h.s.end('That is a strong hook, honestly. Who is it about?')
    expect(h.synthCalls.length).toBeGreaterThan(0)
    h.s.cancel()
    await h.s.done
    for (const { d, url } of h.synthPending) d.resolve(url)
    await flush(); await flush()
    expect(h.played).toEqual([])
    expect(h.revoked.sort()).toEqual(h.synthPending.map(p => p.url).sort())
  })

  it('cancel mid-reply stops the queue: no further requests or plays, even as the stream continues', async () => {
    const h = harness({ autoPlay: false })
    const raw = 'That is a strong hook, honestly. Who is it about? Tell me more. What did the yard sound like in the summer?'
    h.s.update(raw.slice(0, 40))
    await flush(); await flush()
    expect(h.played.length).toBe(1)                    // first sentence playing
    const requestsBefore = h.synthCalls.length
    h.s.cancel()
    await h.s.done                                     // resolves although play() never did
    h.s.update(raw); h.s.end(raw)
    h.playPending[0].resolve()
    await flush(); await flush()
    expect(h.synthCalls.length).toBe(requestsBefore)
    expect(h.played.length).toBe(1)
  })

  it('going not-live between sentences (student started talking) stops before the next clip', async () => {
    let live = true
    const h = harness({ autoPlay: false, live: () => live })
    h.s.end('That is a strong hook, honestly. Who is it about? Tell me more about the yard.')
    await flush(); await flush()
    expect(h.played.length).toBe(1)
    live = false
    h.playPending[0].resolve()
    await flush(); await flush()
    expect(h.played.length).toBe(1)
    await h.s.done
  })

  it('plays strictly in order even when a later clip is fetched first', async () => {
    const h = harness({ autoSynth: false })
    const raw = 'That is a strong hook, honestly. Who is it about? Tell me more about the yard.'
    h.s.end(raw)
    expect(h.synthPending.length).toBe(2)
    h.synthPending[1].d.resolve(h.synthPending[1].url)
    await flush()
    expect(h.played).toEqual([])
    h.synthPending[0].d.resolve(h.synthPending[0].url)
    await h.s.done
    expect(h.played).toEqual(['blob:1', 'blob:2'])
    expect(h.revoked).toEqual(['blob:1', 'blob:2'])
  })
})

describe('createSpeechStream — fallback', () => {
  it('a failed TTS chunk falls back to the browser voice, and the rest of the reply skips TTS', async () => {
    const h = harness({ synthFails: () => true })
    const raw = 'That is a strong hook, honestly. Who is it about? Tell me more about the yard.'
    await streamInto(h.s, raw, 5, flush)
    h.s.end(raw)
    await h.s.done
    expect(h.synthCalls.length).toBe(1)                 // sticky after the first failure
    expect(h.fallbackCalls.join(' ')).toBe(speechText(raw))
    expect(h.played).toEqual([])
  })

  it('onFirstDispatch fires exactly once', async () => {
    const h = harness()
    const raw = 'That is a strong hook, honestly. Who is it about? Tell me more about the yard.'
    await streamInto(h.s, raw, 4, flush)
    h.s.end(raw)
    await h.s.done
    expect(h.firstDispatches).toBe(1)
  })
})

// ── The diagnosis, pinned (positive control) ────────────────────────────────────────
// The split this replaced, copied verbatim from components/TutorSession.js @ 32f1825. It
// is here to show — not assert from memory — that both reported shapes fell through to
// "wait for the whole stream, then synthesise the whole reply", while the new queue
// dispatches mid-stream for the same input.
function oldFirstSentence(full) {
  let t = full.replace(/\[(SCAFFOLD|ACTIVE|NUGGET|DONE|THESIS|PARA_DONE|SOURCE):[^\]]*\]|\[COMPLETE\]|\[DICTATE\]|\[CARE\]/g, '')
  const lastOpen = t.lastIndexOf('[')
  if (lastOpen !== -1 && !t.slice(lastOpen).includes(']')) t = t.slice(0, lastOpen)
  const clean = t.trimStart()
  const m = clean.match(/^\s*(.+?[.!?])(\s|$)/s)
  return m && m[1].trim().length >= 8 && clean.length > m[1].length + 1 ? m[1].trim() : null
}

describe('positive control: the old split missed both shapes mid-stream', () => {
  const SHAPES = {
    'short opener': 'Okay. That is a strong hook, and it starts with a question. Now tell me who the bees belonged to.',
    'lock turn':    `That one's locked in — nice. [DONE:hook:${STUDENT} ${STUDENT}]`,
  }
  for (const [name, raw] of Object.entries(SHAPES)) {
    it(`${name}: old split never fires before the stream ends; the queue does`, async () => {
      let oldFired = false
      const h = harness()
      let newFiredBeforeEnd = false
      for (let i = 1; i < raw.length; i++) {          // every prefix short of the full reply
        if (oldFirstSentence(raw.slice(0, i))) oldFired = true
        h.s.update(raw.slice(0, i))
        if (h.synthCalls.length) newFiredBeforeEnd = true
      }
      expect(oldFired).toBe(false)
      expect(newFiredBeforeEnd).toBe(true)
    })
  }
})
