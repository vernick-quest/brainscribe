import { describe, it, expect } from 'vitest'
import { parseLockPayload, resolveAnchoredSpan, resolveLockPayload } from '@/lib/lockByReference'

// Synthetic fixtures only (public repo — never real student writing).
const SCENE = `One and Two hopped tentatively toward the clearing. The light was low and the ` +
  `grass was wet enough to soak their paws. They stopped at the log, listened, and then went ` +
  `on, gnawing off big chunks of nut.`

describe('parseLockPayload — classify, leniently, before resolving strictly', () => {
  it('empty payload = bare (mechanism 1: lock what the client already holds)', () => {
    expect(parseLockPayload('')).toEqual({ kind: 'bare' })
    expect(parseLockPayload('   ')).toEqual({ kind: 'bare' })
    expect(parseLockPayload(undefined)).toEqual({ kind: 'bare' })
  })

  it('parses the canonical anchored form', () => {
    const p = parseLockPayload('"One and Two hopped tentatively"…"gnawing off big chunks of nut."')
    expect(p.kind).toBe('anchored')
    expect(p.start).toBe('One and Two hopped tentatively')
    expect(p.end).toBe('gnawing off big chunks of nut.')
  })

  it('accepts curly quotes and three dots (what a real model actually emits)', () => {
    const p = parseLockPayload('“One and Two”...“big chunks of nut.”')
    expect(p.kind).toBe('anchored')
    expect(p.start).toBe('One and Two')
    expect(p.end).toBe('big chunks of nut.')
  })

  it('a legacy inline echo is still read — old sessions keep old payloads forever', () => {
    const p = parseLockPayload('One and Two hopped tentatively toward the clearing.')
    expect(p.kind).toBe('inline')
    expect(p.text).toBe('One and Two hopped tentatively toward the clearing.')
  })

  it('an empty anchor is treated as inline, never resolved (it would match everything)', () => {
    expect(parseLockPayload('""…"tail"').kind).toBe('inline')
  })
})

describe('resolveAnchoredSpan — the five rules', () => {
  const msgs = [SCENE]

  it('resolves a span byte-identically from the student\'s own message', () => {
    const r = resolveAnchoredSpan({ start: 'One and Two hopped tentatively', end: 'gnawing off big chunks of nut.' }, msgs)
    expect(r.ok).toBe(true)
    expect(r.text).toBe(SCENE)                 // whole passage, exactly as written
    expect(SCENE.includes(r.text)).toBe(true)  // rule 4
    expect(r.messageIndex).toBe(0)
  })

  it('resolves an INNER span, not just the whole message', () => {
    const r = resolveAnchoredSpan({ start: 'The light was low', end: 'soak their paws.' }, msgs)
    expect(r.ok).toBe(true)
    expect(r.text).toBe('The light was low and the grass was wet enough to soak their paws.')
  })

  // RULE 1 — the spec names this as one of the two places a wrong span comes from.
  it('REFUSES an ambiguous start anchor rather than taking the first match', () => {
    const repeated = ['The wind picked up. They waited. The wind picked up again.']
    const r = resolveAnchoredSpan({ start: 'The wind picked up', end: 'again.' }, repeated)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('start-ambiguous')
  })

  it('REFUSES an ambiguous end anchor', () => {
    const repeated = ['She ran to the door. He ran to the door.']
    const r = resolveAnchoredSpan({ start: 'She ran', end: 'to the door.' }, repeated)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('end-ambiguous')
  })

  it('REFUSES when the same phrase appears in two DIFFERENT messages (ambiguity is global)', () => {
    const r = resolveAnchoredSpan({ start: 'One and Two', end: 'nut.' }, [SCENE, SCENE])
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('start-ambiguous')
  })

  // RULE 2 — the spec's other named source of wrong spans.
  it('REFUSES anchors that are out of order', () => {
    const r = resolveAnchoredSpan({ start: 'gnawing off big chunks', end: 'One and Two hopped' }, msgs)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('end-before-start')
  })

  // RULE 3
  it('REFUSES a span straddling two messages (v1 scope)', () => {
    const r = resolveAnchoredSpan({ start: 'first turn words', end: 'second turn words' },
      ['a sentence with first turn words in it', 'another with second turn words in it'])
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('different-messages')
  })

  it('REFUSES when an anchor is not found at all', () => {
    expect(resolveAnchoredSpan({ start: 'never written', end: 'nut.' }, msgs).reason).toBe('start-not-found')
    expect(resolveAnchoredSpan({ start: 'One and Two', end: 'never written' }, msgs).reason).toBe('end-not-found')
  })

  it('REFUSES empty anchors', () => {
    expect(resolveAnchoredSpan({ start: '', end: 'x' }, msgs).reason).toBe('empty-anchor')
    expect(resolveAnchoredSpan(null, msgs).reason).toBe('empty-anchor')
  })

  it('tolerates whitespace differences in the anchor but still cuts the ORIGINAL bytes', () => {
    // The student typed a newline mid-sentence; the coach quotes it with a single space.
    const wrapped = ['One and Two hopped\n  tentatively toward the clearing. They went on.']
    const r = resolveAnchoredSpan({ start: 'One and Two hopped tentatively', end: 'the clearing.' }, wrapped)
    expect(r.ok).toBe(true)
    expect(r.text).toBe('One and Two hopped\n  tentatively toward the clearing.')  // original whitespace kept
    expect(wrapped[0].includes(r.text)).toBe(true)
  })

  it('never resolves against an empty or absent message list', () => {
    expect(resolveAnchoredSpan({ start: 'a', end: 'b' }, []).ok).toBe(false)
    expect(resolveAnchoredSpan({ start: 'a', end: 'b' }, null).ok).toBe(false)
  })

  it('is case-sensitive — a differently-cased quote is a refusal, not a guess', () => {
    expect(resolveAnchoredSpan({ start: 'ONE AND TWO', end: 'nut.' }, msgs).reason).toBe('start-not-found')
  })
})

describe('resolveLockPayload — payload size is the whole point', () => {
  it('a ~900-word passage resolves from a tiny payload', () => {
    // Build a long, unambiguous passage: a unique opening, filler, a unique close.
    const filler = Array.from({ length: 890 }, (_, i) => `word${i}`).join(' ')
    const long = `The morning began badly. ${filler} And that was how the summer ended.`
    expect(long.split(/\s+/).length).toBeGreaterThan(890)

    const payload = '"The morning began badly."…"And that was how the summer ended."'
    const r = resolveLockPayload(payload, [long])
    expect(r.ok).toBe(true)
    expect(r.text).toBe(long)

    // The assertion the spec asks for directly: the payload does not scale with the
    // writing. ~4 chars/token puts this far under the ~30-token target, while the echo it
    // replaces would have been ~1,200 tokens and would have blown the ceiling.
    expect(payload.length).toBeLessThan(120)
    expect(payload.length / long.length).toBeLessThan(0.02)
  })

  it('passes bare and inline through untouched for the caller to handle', () => {
    expect(resolveLockPayload('', ['x'])).toEqual({ kind: 'bare' })
    expect(resolveLockPayload('some echoed words', ['x'])).toEqual({ kind: 'inline', text: 'some echoed words' })
  })

  it('reports a refusal with a reason the caller can show the student', () => {
    const r = resolveLockPayload('"nope"…"also nope"', [SCENE])
    expect(r.kind).toBe('anchored')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('start-not-found')
  })
})
