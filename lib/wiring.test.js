import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Why a test reads source files (2026-08-17) ───────────────────────────────────────
// Twice inside one change the starting draft was fetched and then silently not delivered:
//
//   1. `.order('position'),,` — a double comma makes an array HOLE, so the destructured
//      name bound to `undefined` and the fetch result landed at an index nobody read. The
//      feature was DEAD in the live writing session.
//   2. `startingDraft` was used in JSX but never added to the destructuring list at all.
//
// `npm run build` passed BOTH times. `npm run test:run` passed both times (826, then 848).
// `npx eslint` passed the first, and enabling `no-sparse-arrays` does not help while lint
// has 58 pre-existing errors and gates nothing. Nothing in the definition of done can see a
// value that was never wired up: there is no type checker on these .js files and no DOM to
// render them into.
//
// So the wiring is asserted at the source level. Precedent: migrationLedger.test.js already
// reads supabase/migrations/* off disk for the same reason — some invariants only exist in
// the text. Assert on the VALUE (the identifier is bound, the producer is called, the value
// is used), never on "it compiled".
const ROOT = join(import.meta.dirname, '..')
const read = f => readFileSync(join(ROOT, f), 'utf8')

const WIRINGS = [
  {
    what: 'the transcript renders the starting draft',
    file: 'app/transcript/[id]/page.js',
    bound: /,\s*startingDraft\s*\]\s*=\s*await Promise\.all\(/,
    calls: /fetchStartingDraft\(\s*db\s*,\s*id\s*\)/,
    uses: /startingDraft=\{startingDraft\.draft\}/,
  },
  {
    what: 'the live session receives the starting draft',
    file: 'app/assignment/[id]/page.js',
    bound: /^\s*startingDraft,\s*$/m,
    calls: /fetchStartingDraft\(\s*service\s*,\s*id\s*\)/,
    uses: /initialStartingDraft=\{startingDraft\.draft\}/,
  },
  {
    what: 'TutorSession renders the card from its prop',
    file: 'components/TutorSession.js',
    bound: /initialStartingDraft = null,/,
    calls: /<StartingDraftCard/,
    uses: /startingDraft=\{initialStartingDraft\}/,
  },
]

describe('starting draft — the value reaches the screen, not just the server', () => {
  for (const w of WIRINGS) {
    it(`${w.what}: identifier bound, producer called, value used`, () => {
      const src = read(w.file)
      expect(w.bound.test(src), `${w.file}: identifier is not bound`).toBe(true)
      expect(w.calls.test(src), `${w.file}: producer is never called`).toBe(true)
      expect(w.uses.test(src), `${w.file}: value is fetched but never used`).toBe(true)
    })
  }
})

describe('no sparse-array holes in the files that had one', () => {
  // `,,` in an array literal shifts every later element by one and binds a name to
  // undefined. This is the literal SEV-1, pinned in the literal files it happened in.
  for (const f of [...new Set(WIRINGS.map(w => w.file))]) {
    it(`${f} has no \`,,\``, () => {
      expect(/,\s*,/.test(read(f)), `${f} contains a sparse-array hole`).toBe(false)
    })
  }
})

// ── Coach pace: trap 1 is an ORDERING bug, so assert the order ───────────────────────
// `playbackRate` does not reliably survive a source change. Setting it once at mount, or
// anywhere BEFORE `el.src = …`, holds for the current utterance and silently reverts to 1×
// on the next — the pace appears to work when you test it and stops working in real use.
// There is no jsdom in this tree, so the invariant is asserted where it actually lives: in
// the source, as a relative position. lib/coachPace.test.js separately proves that
// re-applying after a source change restores the rate.
describe('coach pace — applyPlaybackRate runs AFTER the source is set, on every play', () => {
  const PATHS = [
    { file: 'lib/useCoachVoice.js', src: 'el.src = url' },
    { file: 'components/TutorSession.js', src: 'el.src = url' },
  ]
  for (const p of PATHS) {
    it(`${p.file}: applyPlaybackRate follows \`${p.src}\``, () => {
      const code = read(p.file)
      const iSrc = code.indexOf(p.src)
      const iRate = code.indexOf('applyPlaybackRate(el,')
      expect(iSrc, `${p.file}: no source assignment found`).toBeGreaterThan(-1)
      expect(iRate, `${p.file}: applyPlaybackRate is never called on the play path`).toBeGreaterThan(-1)
      expect(iRate, `${p.file}: applyPlaybackRate runs BEFORE the source change, so the rate will be lost`).toBeGreaterThan(iSrc)
    })
  }

  it('neither playback path pauses or reloads to apply the rate', () => {
    // Pausing on a gesture is what previously cut the coach off when a student merely
    // scrolled. A pace change must mutate the live element.
    for (const f of ['lib/useCoachVoice.js', 'components/TutorSession.js']) {
      const code = read(f)
      const paceBlocks = code.split('applyPlaybackRate').slice(1).map(b => b.slice(0, 160))
      for (const b of paceBlocks) {
        expect(/\.pause\(\)|\.load\(\)/.test(b), `${f}: a pace application pauses or reloads`).toBe(false)
      }
    }
  })
})

// ── COPPA: the under-13 lock must fail CLOSED on a read error (2026-10-11) ───────────
// confirm-role read the profile with `.single()` and DISCARDED the error. On a failed
// read `existing` is null, and isCoppaProtected(null) === false — so the guard that stops
// an under-13 account re-declaring itself 13+ was silently skipped. That is a bypass of
// parental consent, failing in exactly the wrong direction. A source-level assertion
// because no unit test can reach a route handler's discarded-error branch here.
describe('confirm-role COPPA read fails closed', () => {
  const src = read('app/api/profile/confirm-role/route.js')

  it('captures the error from the COPPA profile read', () => {
    expect(src).toMatch(/const \{ data: existing, error: existingErr \} = await service/)
  })

  it('refuses BEFORE the under-13 check runs, so a null `existing` can never reach it', () => {
    const guard = src.indexOf('if (existingErr)')
    const check = src.indexOf('if (isCoppaProtected(existing)')
    expect(guard, 'existingErr guard missing').toBeGreaterThan(-1)
    expect(check, 'isCoppaProtected check missing').toBeGreaterThan(-1)
    expect(guard).toBeLessThan(check)
  })

  it('the refusal returns, rather than logging and carrying on', () => {
    const guard = src.slice(src.indexOf('if (existingErr)'), src.indexOf('if (isCoppaProtected(existing)'))
    expect(guard).toMatch(/return Response\.json/)
  })

  // The premise the guard exists for. If this ever changes, the guard may be redundant —
  // but it must be re-examined, not assumed.
  it('isCoppaProtected(null) really is false — the bypass is real without the guard', async () => {
    const { isCoppaProtected } = await import('./coppa.js')
    expect(isCoppaProtected(null)).toBe(false)
  })
})

// ── Sentence-by-sentence coach speech (2026-10-11) ──────────────────────────────────
// lib/speechStream.test.js proves the queue: ordering, cancellation, late fetches revoked,
// no token or locked student words ever reach TTS, ≤ 4 requests per reply. None of that
// helps if a playback path doesn't USE it, or uses it around the guards. There are TWO
// playback paths — the live session (TutorSession's own <audio> + playClip) and the hook
// (onboarding) — and a previous change wired only the hook, so the feature would have done
// nothing in the live session. Both are pinned here, at the source level (no jsdom).
describe('sentence-by-sentence speech — wired into BOTH playback paths, behind every guard', () => {
  const tutor = read('components/TutorSession.js')
  const hook  = read('lib/useCoachVoice.js')
  const fnBody = (src, name) => {
    const i = src.indexOf(`function ${name}(`)
    expect(i, `function ${name} not found`).toBeGreaterThan(-1)
    return src.slice(i, i + 1800)
  }

  it('the live coach turn feeds the RAW stream into the queue as it arrives, and flushes at the end', () => {
    // 2026-10-12: the read loop moved into lib/coachTurn.js runCoachTurn (timeout + exit
    // paths). askTutor feeds the queue from onChunk (every read) and flushes it from
    // onStreamEnd; runCoachTurn calls onStreamEnd BEFORE apply (where the scaffold parse
    // lives) — that ordering is pinned in lib/coachTurn.test.js ("flushes speech BEFORE…").
    const ask = tutor.slice(tutor.indexOf('async function askTutor('))
    const onChunk = ask.slice(ask.indexOf('onChunk:'), ask.indexOf('onStreamEnd:'))
    const onEnd = ask.slice(ask.indexOf('onStreamEnd:'), ask.indexOf('apply:'))
    expect(/speechForTurn\(\)\?\.update\(full\)/.test(onChunk), 'askTutor does not feed the stream into the speech queue').toBe(true)
    expect(/speechForTurn\(\)\?\.end\(full\)/.test(onEnd), 'askTutor never flushes the remainder').toBe(true)
    // The flush must come BEFORE the scaffold parse, which can await a network PATCH.
    expect(ask.indexOf('speechForTurn()?.end(full)')).toBeLessThan(ask.indexOf('parseAndApplyScaffoldTokens(full'))
    expect(/apply: async \(full, ownsUi\) => \{[\s\S]*?parseAndApplyScaffoldTokens\(full/.test(ask), 'the scaffold parse must live in apply (only reached by a non-aborted turn)').toBe(true)
    // …but the child-safety card must survive a failed/aborted turn (display-only, fail-safe).
    const onFail = ask.slice(ask.indexOf('onFailure:'))
    expect(/partial\?\.includes\('\[CARE\]'\)\) setShowCrisisCard\(true\)/.test(onFail), 'a [CARE] that arrived before a timeout must still open the crisis card').toBe(true)
  })

  it('read-aloud OFF never creates a queue (zero /api/speak), and the queue re-checks it before every request and clip', () => {
    const ask = tutor.slice(tutor.indexOf('async function askTutor('))
    expect(/if \(!speech && readAloudRef\.current && tutorRunRef\.current === myRun\)/.test(ask)).toBe(true)
    const start = fnBody(tutor, 'startSpeechStream')
    expect(/isLive:\s*\(\) => mountedRef\.current && readAloudRef\.current && isCurrent\(\)/.test(start)).toBe(true)
  })

  it('every live-session clip goes through playClip (the ONE unlocked element, pace re-applied per clip)', () => {
    const start = fnBody(tutor, 'startSpeechStream')
    expect(/play:\s*\(url\) => playClip\(url\)/.test(start)).toBe(true)
    expect(tutor.split('new Audio(').length - 1, 'TutorSession must create exactly one audio element').toBe(1)
    expect(hook.split('new Audio(').length - 1, 'useCoachVoice must create exactly one audio element').toBe(1)
  })

  it('every stop cancels the queue — stopCurrentAudio and the unmount cleanup', () => {
    const stop = fnBody(tutor, 'stopCurrentAudio')
    expect(/speechRef\.current\.cancel\(\)/.test(stop.slice(0, 300)), 'stopCurrentAudio does not cancel the sentence queue').toBe(true)
    const unmount = tutor.slice(tutor.indexOf('mountedRef.current = false'), tutor.indexOf('mountedRef.current = false') + 300)
    expect(/speechRef\.current\.cancel\(\)/.test(unmount), 'unmount does not cancel the sentence queue').toBe(true)
  })

  it('the only /api/speak callers in the live session are fetchTts (the queue) and the word-sync read-back', () => {
    expect(tutor.split("'/api/speak'").length - 1).toBe(2)
    expect(/async function fetchTts\(/.test(tutor)).toBe(true)
    expect(/async function playWithSync\(/.test(tutor)).toBe(true)
  })

  it('the onboarding hook speaks through the same queue, cancelled on stop and on a new line', () => {
    expect(/createSpeechStream\(/.test(hook)).toBe(true)
    expect(/play:\s*playUrl/.test(hook)).toBe(true)
    expect(/isLive:\s*\(\) => seqRef\.current === seq/.test(hook)).toBe(true)
    const stop = hook.slice(hook.indexOf('const stop = useCallback'), hook.indexOf('const stop = useCallback') + 200)
    expect(/release\(\)/.test(stop)).toBe(true)
  })
})

// ── /api/tutor: the starting draft and the LIVE count reach the prompt (2026-10-11) ──
// Same reason as the starting-draft wirings above: a value fetched and never passed on
// compiles, builds and tests green. Assert the producer is called with the SERVICE client,
// the result is passed into buildCoachSystemBlocks, and the stale stored count is not what
// the prompt receives.
describe('/api/tutor — the coach is handed what the student actually wrote', () => {
  const src = read('app/api/tutor/route.js')

  it('reads the starting draft with the service client', () => {
    expect(src).toMatch(/fetchStartingDraft\(\s*svc\s*,\s*sessionId\s*\)/)
    expect(src).toMatch(/const svc = createServiceClient\(\)/)
  })

  it('passes the starting draft into the prompt builder', () => {
    expect(src).toMatch(/buildCoachSystemBlocks\([^)]*\{[\s\S]*?\bstartingDraft,[\s\S]*?\}\)/)
  })

  it('computes the word count live, the way completion will build the final Draft', () => {
    expect(src).toMatch(/computeActualLive\(\s*parasRead\.data \?\? \[\]\s*,\s*scaffold\?\.components\s*\)/)
    // The row→section match needs these columns; without them every row reads as "extra".
    expect(src).toMatch(/select\('scribed_text, position, paragraph_index'\)/)
    expect(src).toMatch(/requirements:\s*liveRequirements/)
  })

  it('never hands the prompt the stale stored requirements directly', () => {
    expect(src).not.toMatch(/requirements:\s*sessionRow\?\.requirements/)
  })

  it('tells the prompt when the count could not be read', () => {
    expect(src).toMatch(/\bwordCountUnavailable,/)
  })
})
