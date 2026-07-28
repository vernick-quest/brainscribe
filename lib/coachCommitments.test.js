// Tests for the promise-vs-reality check that replaced the word-count heuristic.
//
// Every fixture below is the shape of a REAL session from the 2026-07-28 investigation,
// because the whole point of this module is telling those shapes apart — the previous
// detectors could not.

import { describe, it, expect } from 'vitest'
import { parseCommitments, reconcileCommitments } from './coachCommitments'

const filled = (id, text) => ({ id, label: id, status: 'confirmed', text, nuggetText: null })
const empty = (id) => ({ id, label: id, status: 'locked', text: null, nuggetText: null })
const section = (items) => ({ index: 0, type: 'personal_statement', status: 'complete', items })

describe('parseCommitments', () => {
  it('reads a bare [DONE:id]', () => {
    expect(parseCommitments('Body is locked in. [DONE:body]').components).toEqual(['body'])
  })

  it('reads [DONE:id:inline text] without swallowing the id', () => {
    const t = '[DONE:hook:Have you ever dreamt of exploring space?]'
    expect(parseCommitments(t).components).toEqual(['hook'])
  })

  it('collects several across one turn, in order, deduped', () => {
    const t = 'nice [DONE:hook] and also [DONE:context] and again [DONE:hook]'
    expect(parseCommitments(t).components).toEqual(['hook', 'context'])
  })

  it('picks up PARA_DONE separately from component commitments', () => {
    const r = parseCommitments('[PARA_DONE:0:the introduction] [DONE:closing]')
    expect(r.paragraphsCompleted).toEqual([0])
    expect(r.components).toEqual(['closing'])
  })

  it('is not fooled by the coach merely SAYING "locked in" in prose', () => {
    // The distinction that matters: prose is chat, a token is a promise. Elio's coach said
    // "Body is locked in" in prose on every turn; only the token means it was saved.
    expect(parseCommitments('Body is locked in. Nice work!').components).toEqual([])
  })

  it('ignores the other control tokens', () => {
    const t = '[SCAFFOLD:x] [ACTIVE:body] [NUGGET:body:some words] [THESIS:a claim] [COMPLETE]'
    expect(parseCommitments(t).components).toEqual([])
  })

  it('tolerates empty, null and token-free text', () => {
    expect(parseCommitments('').components).toEqual([])
    expect(parseCommitments(null).components).toEqual([])
  })
})

describe('reconcileCommitments', () => {
  it('catches the Elio 2026-06-26 loss — promised, nothing saved', () => {
    // The coach emitted [DONE:body] after building the body over five exchanges without a
    // [NUGGET:], so there was nothing to write. He said so himself 35 seconds later.
    const r = reconcileCommitments(
      [{ component_id: 'hook' }, { component_id: 'body' }],
      [section([filled('hook', 'Have you ever dreamt of exploring space?'), empty('body')])],
    )
    expect(r.broken).toEqual(['body'])
    expect(r.kept).toEqual(['hook'])
  })

  it('catches the Baron 2026-07-20 loss the word count can no longer reach', () => {
    const r = reconcileCommitments(
      [{ component_id: 'hook' }, { component_id: 'reflection' }, { component_id: 'connection' }],
      [section([filled('hook', 'It was late afternoon.'), empty('reflection'), empty('connection')])],
    )
    expect(r.broken).toEqual(['reflection', 'connection'])
  })

  it('stays SILENT on Lyndsay — her coach never promised a roadmap', () => {
    // "since this is a two paragraph quick write, we don't really need a roadmap".
    // No promise, no breach. This is the false positive that made the old detector noise.
    const r = reconcileCommitments(
      [{ component_id: 'hook' }, { component_id: 'thesis' }],
      [section([filled('hook', 'I spent my lunchtime uncomfortable.'), filled('thesis', 'Hard conversations matter.'), empty('roadmap')])],
    )
    expect(r.broken).toEqual([])
    expect(r.checked).toBe(2)
  })

  it('stays silent on a session we already repaired', () => {
    // A restore writes into the paragraph rows, so the old scaffold slots stay empty
    // forever — without this the fix would manufacture a permanent broken promise.
    const r = reconcileCommitments(
      [{ component_id: 'body' }],
      [section([empty('body')])],
      { restored: true },
    )
    expect(r.broken).toEqual([])
  })

  it('counts a component held as an unconfirmed nugget as saved, not lost', () => {
    const r = reconcileCommitments([{ component_id: 'body' }], [section([
      { id: 'body', label: 'body', status: 'candidate', text: null, nuggetText: 'the words they said' },
    ])])
    expect(r.broken).toEqual([])
  })

  it('matches case-insensitively and dedupes repeat commitments', () => {
    const r = reconcileCommitments(
      [{ component_id: 'Body' }, { component_id: 'body' }],
      [section([empty('body')])],
    )
    expect(r.broken).toEqual(['body'])
    expect(r.checked).toBe(1)
  })

  it('is clean when nothing was ever promised', () => {
    expect(reconcileCommitments([], [section([empty('body')])]).broken).toEqual([])
  })
})
