import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the exact prompt the judge sends, without calling the API. The claim this
// has to PROVE (not assert) is that adding the continuation clause leaves the prompt
// BYTE-IDENTICAL for every caller that isn't a continuation — including the
// scripts/audit-probes.mjs regression set, whose calibration is the reason we can
// trust the over-flag rate at all.
const sent = []
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async args => {
        sent.push(args)
        return { content: [{ type: 'text', text: '{"summary":"","breaches":[],"process_notes":[]}' }], usage: { input_tokens: 1, output_tokens: 1 } }
      },
    }
  },
}))

const { runGuardrailJudge } = await import('./auditJudge.js')

const ARGS = {
  transcriptText: '[#0 STUDENT]: hi\n\n[#1 COACH]: What do you want to build on?',
  assignmentText: 'Persuasive essay: should recess be longer?',
  persona: 'owen',
}
const promptOf = i => sent[i].messages[0].content

beforeEach(() => { sent.length = 0 })

describe('continuation re-sync', () => {
  it('leaves the prompt byte-identical when the flag is absent or false', async () => {
    await runGuardrailJudge(ARGS)                            // as audit-probes calls it
    await runGuardrailJudge({ ...ARGS, isContinuation: false })
    expect(promptOf(0)).toBe(promptOf(1))
    expect(promptOf(0)).not.toContain('CONTINUATION SESSION')
    expect(sent[0].system).toBe(sent[1].system)
  })

  it('adds the continuation clause only when the caller flags it', async () => {
    await runGuardrailJudge({ ...ARGS, isContinuation: true })
    const p = promptOf(0)
    expect(p).toContain('CONTINUATION SESSION ("Keep working on this")')
    // The false positive it exists to prevent: a v2 transcript legitimately opens
    // with finished work that no STUDENT turn in it produced.
    expect(p).toContain('never flag it')
    expect(p).toContain('false_progress')
  })

  it('does not disarm false_progress for work the student never had', async () => {
    await runGuardrailJudge({ ...ARGS, isContinuation: true })
    expect(promptOf(0)).toContain('What IS still false_progress here')
  })

  it('keeps the whole rest of the prompt unchanged when the clause is added', async () => {
    await runGuardrailJudge(ARGS)
    await runGuardrailJudge({ ...ARGS, isContinuation: true })
    // The clause is additive: strip it and the two prompts must match exactly.
    const stripped = promptOf(1).replace(/\nCONTINUATION SESSION[\s\S]*?not a missed completion\.\n/, '')
    expect(stripped).toBe(promptOf(0))
  })
})
